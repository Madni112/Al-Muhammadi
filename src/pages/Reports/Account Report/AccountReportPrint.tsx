import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { MdPrint, MdArrowBack, MdFileDownload, MdChevronRight, MdExpandMore, MdUnfoldMore, MdUnfoldLess, MdTableChart, MdViewList } from 'react-icons/md';
import { FaWhatsapp } from 'react-icons/fa';
import { useAuth } from '../../../Context/Auth';
import { exportToExcel, ExcelColumn } from '../../../utils/excelExport';
import ReportPagination from '../../../components/ReportPagination';

const AccountReportPrint = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { businessName, tenantId } = useAuth();
    const [loading, setLoading] = useState(true);
    const [reportRows, setReportRows] = useState<any[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState<number | 'all'>(25);
    const [isPrinting, setIsPrinting] = useState(false);
    const [expandedCustomerIds, setExpandedCustomerIds] = useState<Set<string | number>>(new Set());

    const config = location.state || { tab: 1, criteria: {} };
    const { tab: activeTab, criteria: filters } = config;

    const [activeViewMode, setActiveViewMode] = useState<'summary' | 'detailed'>(
        filters?.viewMode === 'detailed' ? 'detailed' : 'summary'
    );

    const [showZeroValues, setShowZeroValues] = useState<boolean>(Boolean(filters?.showZeroValues));

    const toggleCustomerExpanded = (id: string | number) => {
        setExpandedCustomerIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAllCustomerDetails = () => {
        if (expandedCustomerIds.size > 0) {
            setExpandedCustomerIds(new Set());
            setActiveViewMode('summary');
        } else {
            setExpandedCustomerIds(new Set(reportRows.map(r => r.id || r.code)));
            setActiveViewMode('detailed');
        }
    };

    const handleViewModeChange = (mode: 'summary' | 'detailed') => {
        setActiveViewMode(mode);
        if (mode === 'detailed') {
            setExpandedCustomerIds(new Set(reportRows.map(r => r.id || r.code)));
        } else {
            setExpandedCustomerIds(new Set());
        }
    };

    // Auto-expand all items when detailed mode is selected
    useEffect(() => {
        if (activeViewMode === 'detailed' && reportRows.length > 0) {
            setExpandedCustomerIds(new Set(reportRows.map(r => r.id || r.code)));
        }
    }, [reportRows, activeViewMode]);

    const filteredRows = useMemo(() => {
        if (activeTab === 11) {
            return reportRows.filter(r => {
                if (!showZeroValues) {
                    const hasNonZeroBalance = Math.abs(Number(r.debit || 0)) > 0.001 || Math.abs(Number(r.credit || 0)) > 0.001;
                    if (!hasNonZeroBalance) return false;
                }
                return true;
            }).map(r => {
                if (!showZeroValues && r.details) {
                    return {
                        ...r,
                        details: r.details.filter((dt: any) => Math.abs(Number(dt.debit || 0)) > 0.001 || Math.abs(Number(dt.credit || 0)) > 0.001 || Math.abs(Number(dt.balance || 0)) > 0.001)
                    };
                }
                return r;
            });
        }
        return reportRows;
    }, [reportRows, activeTab, showZeroValues]);

    useEffect(() => {
        const handleBeforePrint = () => setIsPrinting(true);
        const handleAfterPrint = () => setIsPrinting(false);
        window.addEventListener('beforeprint', handleBeforePrint);
        window.addEventListener('afterprint', handleAfterPrint);
        return () => {
            window.removeEventListener('beforeprint', handleBeforePrint);
            window.removeEventListener('afterprint', handleAfterPrint);
        };
    }, []);

    useEffect(() => {
        setCurrentPage(1);
        setShowZeroValues(Boolean(filters?.showZeroValues));
    }, [activeTab, JSON.stringify(filters)]);

    const paginatedRows = useMemo(() => {
        if (isPrinting || pageSize === 'all') return filteredRows;
        const start = (currentPage - 1) * pageSize;
        return filteredRows.slice(start, start + pageSize);
    }, [filteredRows, currentPage, pageSize, isPrinting]);

    const startIndex = (currentPage - 1) * (pageSize === 'all' ? 0 : (pageSize as number));

    useEffect(() => {
        const originalTitle = document.title;
        document.title = activeTab === 13 
            ? 'Customer Balance Detail Report - ZOAIB ALI & COMPANY'
            : activeTab === 3
            ? 'Vendor Balance Detail Report - ZOAIB ALI & COMPANY'
            : 'Corporate Account Ledger - ZOAIB ALI & COMPANY';

        return () => {
            document.title = originalTitle;
        };
    }, [activeTab]);

    useEffect(() => {
        const compileAccountAuditingDataset = async () => {
            try {
                setLoading(true);

                // --- 📊 TAB 1 & TAB 13: CUSTOMER ACCOUNT LEDGER & BALANCE DETAIL AUDIT REPORT ---
                if (activeTab === 1 || activeTab === 13) {
                    const [custRes, invRes, retRes, vchRes] = await Promise.all([
                        supabase.from('customers').select('*'),
                        supabase.from('sales_invoices').select('*').order('id', { ascending: true }),
                        supabase.from('sales_returns').select('*'),
                        supabase.from('financial_vouchers').select('*')
                    ]);

                    if (custRes.error) throw custRes.error;
                    if (invRes.error) throw invRes.error;

                    let allCustomers = custRes.data || [];
                    const allInvoices = invRes.data || [];
                    const allReturns = retRes.data || [];
                    const allVouchers = vchRes.data || [];

                    // 1. Apply Customer Category Filter
                    if (filters.customerCategory && filters.customerCategory.length > 0 && !filters.customerCategory.includes('All')) {
                        allCustomers = allCustomers.filter(c => filters.customerCategory.includes(c.registrationType || 'Retail / General'));
                    }

                    // 2. Apply Customer Name Filter
                    if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) {
                        const rawFilterList = Array.isArray(filters.customer) ? filters.customer : [filters.customer];
                        allCustomers = allCustomers.filter(c => {
                            const code = c.customer_code || c.customerCode;
                            const codeAndName = code ? `[${code}] ${c.customerName}` : c.customerName;
                            return rawFilterList.some((fVal: string) => {
                                const clean = fVal.replace(/^\[.*?\]\s*/, '').trim().toLowerCase();
                                return (
                                    fVal === c.customerName ||
                                    fVal === codeAndName ||
                                    (code && fVal === code) ||
                                    clean === (c.customerName || '').trim().toLowerCase()
                                );
                            });
                        });
                    }

                    const startTimestamp = filters.dateFrom ? new Date(filters.dateFrom + 'T00:00:00').getTime() : 0;
                    const endTimestamp = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59').getTime() : Infinity;

                    const compiledCustomerRows = allCustomers.map(cust => {
                        const custName = (cust.customerName || '').trim();

                        // Match invoices for this customer
                        const custInvoices = allInvoices.filter(i => (i.customer_name || '').trim().toLowerCase() === custName.toLowerCase());

                        // Match returns for this customer
                        const custReturns = allReturns.filter(r => (r.customer_name || '').trim().toLowerCase() === custName.toLowerCase());

                        // Match vouchers/receipts specifically for this customer (exact customer name matching only)
                        const custVouchers = allVouchers.filter(v => {
                            const voucherCust = (
                                v.customer_name || 
                                v.customerName || 
                                v.metadata?.customer_name || 
                                v.metadata?.customerName || 
                                v.meta?.customer_name || 
                                v.meta?.customerName || 
                                ''
                            ).trim();

                            const isReceiptType = !v.voucher_type || 
                                v.voucher_type.toLowerCase().includes('receipt') || 
                                v.voucher_type.toLowerCase().includes('crv') || 
                                v.voucher_type.toLowerCase().includes('brv') || 
                                v.meta?.moduleSource === 'sales_receipt' ||
                                v.metadata?.moduleSource === 'sales_receipt';

                            if (!isReceiptType) return false;

                            // Direct customer name match
                            if (voucherCust && voucherCust.toLowerCase() === custName.toLowerCase()) {
                                return true;
                            }

                            return false;
                        });

                        // Map invoice IDs for customer
                        const customerInvoiceIdSet = new Set(custInvoices.map(i => String(i.id).trim().toLowerCase()));

                        // Calculate Prior to DateFrom (Opening Balance)
                        let openingDebit = 0;
                        let openingCredit = 0;

                        custInvoices.forEach(inv => {
                            const d = inv.sale_date || inv.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            if (t < startTimestamp) {
                                const invIdStr = String(inv.id).trim().toLowerCase();
                                const totAmt = Number(inv.total_amount || 0);
                                const initialPaid = Number(inv.cash_amount_paid || inv.amount_paid || 0);

                                const linkedVouchers = custVouchers.filter(v => {
                                    const ref = String(v.original_invoice_no || '').replace('INV-', '').trim().toLowerCase();
                                    return ref === invIdStr;
                                });
                                const linkedVouchersSum = linkedVouchers.reduce((s, v) => s + Number(v.total_amount || v.amount || 0), 0);

                                const linkedReturns = custReturns.filter(r => {
                                    const ref = String(r.original_invoice_no || '').replace('INV-', '').trim().toLowerCase();
                                    return ref === invIdStr;
                                });
                                const linkedReturnsSum = linkedReturns.reduce((s, r) => s + Number(r.total_amount || 0), 0);

                                const trueInvoicePaid = Math.min(totAmt, initialPaid + linkedVouchersSum + linkedReturnsSum);

                                openingDebit += totAmt;
                                openingCredit += trueInvoicePaid;
                            }
                        });

                        // Unlinked vouchers prior to DateFrom (general advances / on-account receipts)
                        custVouchers.forEach(vch => {
                            const ref = String(vch.original_invoice_no || '').replace('INV-', '').trim().toLowerCase();
                            const isUnlinked = !ref || !customerInvoiceIdSet.has(ref);
                            if (isUnlinked) {
                                const d = vch.voucher_date || vch.created_at;
                                const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                                if (t < startTimestamp) {
                                    openingCredit += Number(vch.total_amount || vch.amount || 0);
                                }
                            }
                        });

                        // Unlinked returns prior to DateFrom
                        custReturns.forEach(ret => {
                            const ref = String(ret.original_invoice_no || '').replace('INV-', '').trim().toLowerCase();
                            const isUnlinked = !ref || !customerInvoiceIdSet.has(ref);
                            if (isUnlinked) {
                                const d = ret.return_date || ret.created_at;
                                const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                                if (t < startTimestamp) {
                                    openingCredit += Number(ret.total_amount || 0);
                                }
                            }
                        });

                        const openingBalance = openingDebit - openingCredit;

                        // Calculate Within Period (DateFrom to DateTo)
                        let periodDebit = 0;
                        let periodCredit = 0;
                        let txCount = 0;

                        custInvoices.forEach(inv => {
                            const d = inv.sale_date || inv.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            if (t >= startTimestamp && t <= endTimestamp) {
                                const invIdStr = String(inv.id).trim().toLowerCase();
                                const totAmt = Number(inv.total_amount || 0);
                                const initialPaid = Number(inv.cash_amount_paid || inv.amount_paid || 0);

                                const linkedVouchers = custVouchers.filter(v => {
                                    const ref = String(v.original_invoice_no || '').replace('INV-', '').trim().toLowerCase();
                                    return ref === invIdStr;
                                });
                                const linkedVouchersSum = linkedVouchers.reduce((s, v) => s + Number(v.total_amount || v.amount || 0), 0);

                                const linkedReturns = custReturns.filter(r => {
                                    const ref = String(r.original_invoice_no || '').replace('INV-', '').trim().toLowerCase();
                                    return ref === invIdStr;
                                });
                                const linkedReturnsSum = linkedReturns.reduce((s, r) => s + Number(r.total_amount || 0), 0);

                                const trueInvoicePaid = Math.min(totAmt, initialPaid + linkedVouchersSum + linkedReturnsSum);

                                periodDebit += totAmt;
                                periodCredit += trueInvoicePaid;
                                txCount++;
                            }
                        });

                        // Unlinked vouchers within period (general advances / on-account receipts)
                        custVouchers.forEach(vch => {
                            const ref = String(vch.original_invoice_no || '').replace('INV-', '').trim().toLowerCase();
                            const isUnlinked = !ref || !customerInvoiceIdSet.has(ref);
                            if (isUnlinked) {
                                const d = vch.voucher_date || vch.created_at;
                                const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                                if (t >= startTimestamp && t <= endTimestamp) {
                                    periodCredit += Number(vch.total_amount || vch.amount || 0);
                                    txCount++;
                                }
                            }
                        });

                        // Unlinked returns within period
                        custReturns.forEach(ret => {
                            const ref = String(ret.original_invoice_no || '').replace('INV-', '').trim().toLowerCase();
                            const isUnlinked = !ref || !customerInvoiceIdSet.has(ref);
                            if (isUnlinked) {
                                const d = ret.return_date || ret.created_at;
                                const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                                if (t >= startTimestamp && t <= endTimestamp) {
                                    periodCredit += Number(ret.total_amount || 0);
                                    txCount++;
                                }
                            }
                        });

                        const closingBalance = openingBalance + periodDebit - periodCredit;

                        // Build explicit balance breakdown / reasons
                        const balanceReasons: string[] = [];

                        // 1. Unpaid invoices
                        const unpaidInvoices: Array<{ invNo: string; due: number }> = [];
                        custInvoices.forEach(inv => {
                            const totAmt = Number(inv.total_amount || 0);
                            const initialPaid = Number(inv.cash_amount_paid || inv.amount_paid || 0);
                            const invIdStr = String(inv.id).trim().toLowerCase();
                            const linkedVouchersSum = custVouchers
                                .filter(v => String(v.original_invoice_no || '').replace('INV-', '').trim().toLowerCase() === invIdStr)
                                .reduce((s, v) => s + Number(v.total_amount || v.amount || 0), 0);

                            const linkedReturnsSum = custReturns
                                .filter(r => String(r.original_invoice_no || '').replace('INV-', '').trim().toLowerCase() === invIdStr)
                                .reduce((s, r) => s + Number(r.total_amount || 0), 0);

                            const unpaidAmt = totAmt - (initialPaid + linkedVouchersSum + linkedReturnsSum);
                            if (unpaidAmt > 0.01) {
                                unpaidInvoices.push({
                                    invNo: inv.invoice_no || `INV-${inv.id}`,
                                    due: unpaidAmt
                                });
                            }
                        });

                        if (unpaidInvoices.length > 0) {
                            balanceReasons.push(`Unpaid Invoices (${unpaidInvoices.length}): ${unpaidInvoices.slice(0, 3).map(u => `${u.invNo} [Rs. ${u.due.toLocaleString()}]`).join(', ')}${unpaidInvoices.length > 3 ? '...' : ''}`);
                        }

                        // 2. Unlinked advances
                        let unlinkedAdvTotal = 0;
                        custVouchers.forEach(vch => {
                            const ref = String(vch.original_invoice_no || '').replace('INV-', '').trim().toLowerCase();
                            if (!ref || !customerInvoiceIdSet.has(ref)) {
                                unlinkedAdvTotal += Number(vch.total_amount || vch.amount || 0);
                            }
                        });
                        if (unlinkedAdvTotal > 0.01) {
                            balanceReasons.push(`Advance Receipts Logged: Rs. ${unlinkedAdvTotal.toLocaleString()}`);
                        }

                        // 3. Unlinked returns
                        let unlinkedRetTotal = 0;
                        custReturns.forEach(ret => {
                            const ref = String(ret.original_invoice_no || '').replace('INV-', '').trim().toLowerCase();
                            if (!ref || !customerInvoiceIdSet.has(ref)) {
                                unlinkedRetTotal += Number(ret.total_amount || 0);
                            }
                        });
                        if (unlinkedRetTotal > 0.01) {
                            balanceReasons.push(`Credit Notes / Returns: Rs. ${unlinkedRetTotal.toLocaleString()}`);
                        }

                        // 4. Assemble Chronological Detailed Transactions Ledger
                        const rawTransactions: Array<{
                            date: string;
                            raw_date: string;
                            type: string;
                            refNo: string;
                            notes: string;
                            debit: number;
                            credit: number;
                        }> = [];

                        // Beginning / Opening Balance line (Always shown as initial ledger line)
                        rawTransactions.push({
                            date: filters.dateFrom || 'Opening',
                            raw_date: filters.dateFrom ? filters.dateFrom + 'T00:00:00' : '1970-01-01',
                            type: 'Beginning Balance (B/F)',
                            refNo: '-',
                            notes: 'Beginning / Opening Balance Brought Forward',
                            debit: openingBalance > 0 ? openingBalance : 0,
                            credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
                        });

                        // Invoices within period
                        custInvoices.forEach(inv => {
                            const d = inv.sale_date || inv.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            if (t >= startTimestamp && t <= endTimestamp) {
                                const totAmt = Number(inv.total_amount || 0);
                                rawTransactions.push({
                                    date: String(d).split('T')[0],
                                    raw_date: String(d),
                                    type: 'Sales Invoice',
                                    refNo: inv.invoice_no || `INV-${inv.id}`,
                                    notes: inv.dispatch_warehouse ? `Warehouse: ${inv.dispatch_warehouse}` : 'Sales Invoice Issued',
                                    debit: totAmt,
                                    credit: 0
                                });
                            }
                        });

                        // Vouchers within period
                        custVouchers.forEach(vch => {
                            const d = vch.voucher_date || vch.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            if (t >= startTimestamp && t <= endTimestamp) {
                                const vAmt = Number(vch.total_amount || vch.amount || 0);
                                if (vAmt > 0) {
                                    rawTransactions.push({
                                        date: String(d).split('T')[0],
                                        raw_date: String(d),
                                        type: 'Receipt Voucher',
                                        refNo: vch.voucher_no || `CRV-${vch.id}`,
                                        notes: vch.original_invoice_no ? `Against Invoice ${vch.original_invoice_no}` : (vch.payment_mode || 'Cash Drawer Payment'),
                                        debit: 0,
                                        credit: vAmt
                                    });
                                }
                            }
                        });

                        // Sales Returns within period
                        custReturns.forEach(ret => {
                            const d = ret.return_date || ret.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            if (t >= startTimestamp && t <= endTimestamp) {
                                const rAmt = Number(ret.total_amount || 0);
                                if (rAmt > 0) {
                                    rawTransactions.push({
                                        date: String(d).split('T')[0],
                                        raw_date: String(d),
                                        type: 'Sales Return (Credit Note)',
                                        refNo: ret.return_no || `RTN-${ret.id}`,
                                        notes: ret.original_invoice_no ? `Return against ${ret.original_invoice_no}` : (ret.settlement_mode ? `Mode: ${ret.settlement_mode}` : 'Stock Reversal'),
                                        debit: 0,
                                        credit: rAmt
                                    });
                                }
                            }
                        });

                        // Sort chronological
                        rawTransactions.sort((a, b) => new Date(a.raw_date).getTime() - new Date(b.raw_date).getTime());

                        // Calculate running balances
                        let currentRunningBal = 0;
                        const itemizedTransactions = rawTransactions.map(tx => {
                            currentRunningBal += (tx.debit - tx.credit);
                            return {
                                ...tx,
                                runningBalance: currentRunningBal
                            };
                        });

                        const primaryReason = balanceReasons[0] || '';

                        return {
                            id: cust.id,
                            customer_name: cust.customerName || 'Walking Customer',
                            customer_code: cust.customer_code || cust.customerCode || '-',
                            category: cust.registrationType || 'Retail / General',
                            phone: cust.mobileNo || cust.phoneNo || '-',
                            address: cust.businessAddress || cust.residentialAddress || '-',
                            opening_balance: openingBalance,
                            period_debit: periodDebit,
                            period_credit: periodCredit,
                            closing_balance: closingBalance,
                            tx_count: txCount,
                            balance_reason: primaryReason,
                            balance_reasons: balanceReasons,
                            transactions: itemizedTransactions
                        };
                    });

                    let finalRows = compiledCustomerRows;

                    // Filter: When showZeroValues is false, only show customers with transactions in selected period
                    if (filters.showZeroValues === false) {
                        finalRows = finalRows.filter(r => r.period_debit > 0.01 || r.period_credit > 0.01 || r.tx_count > 0);
                    }

                    finalRows.sort((a, b) => a.customer_name.localeCompare(b.customer_name));

                    setReportRows(finalRows);
                }

                // --- 📊 TAB 2: CUSTOMER ACCOUNT BALANCE LEDGER ---
                else if (activeTab === 2) {
                    const { data: invoices, error: invErr } = await supabase
                        .from('sales_invoices')
                        .select('*')
                        .order('id', { ascending: true });

                    const { data: returns, error: retErr } = await supabase
                        .from('sales_returns')
                        .select('original_invoice_no, total_amount');

                    if (invErr) throw invErr;
                    if (retErr) throw retErr;

                    let pool = invoices || [];

                    if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) {
                        pool = pool.filter(row => filters.customer.includes(row.customer_name));
                    }

                    if (filters.dateFrom && filters.dateTo) {
                        const startTimestamp = new Date(filters.dateFrom).getTime();
                        const endTimestamp = new Date(filters.dateTo).getTime();

                        pool = pool.filter(row => {
                            const rawRowDate = row.sale_date || String(row.created_at || '').split('T')[0];
                            if (!rawRowDate) return false;
                            const rowTimestamp = new Date(rawRowDate).getTime();
                            return rowTimestamp >= startTimestamp && rowTimestamp <= endTimestamp;
                        });
                    }

                    const adjustedCustomerRows = pool.map(inv => {
                        const matchingReturns = (returns || []).filter(r => {
                            const cleanRef = String(r.original_invoice_no || '').replace('INV-', '').trim();
                            return cleanRef === String(inv.id).trim();
                        });

                        const totalReturnedValue = matchingReturns.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
                        const finalAdjustedInvoiceValue = Math.max(0, Number(inv.total_amount || 0) - totalReturnedValue);

                        return {
                            ...inv,
                            total_amount: finalAdjustedInvoiceValue
                        };
                    });

                    setReportRows(adjustedCustomerRows);
                }

                // --- 📊 TAB 12: ACCOUNT DEBIT AGING MATRIX SHEET (AGING REPORT) ---
                else if (activeTab === 12) {
                    const { data: invoices, error: invErr } = await supabase
                        .from('sales_invoices')
                        .select('*')
                        .order('id', { ascending: true });

                    if (invErr) throw invErr;

                    const today = new Date();

                    const customerAgingMap: Record<string, {
                        customer_name: string;
                        total_due: number;
                        days_0_30: number;
                        days_31_60: number;
                        days_61_90: number;
                        days_90_plus: number;
                        invoice_count: number;
                    }> = {};

                    (invoices || []).forEach(inv => {
                        const custName = inv.customer_name || 'General Customer';

                        if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All') && !filters.customer.includes(custName)) {
                            return;
                        }

                        const totalAmount = Number(inv.total_amount || 0);
                        const paidAmount = Number(inv.cash_amount_paid || inv.amount_paid || 0);
                        const outstanding = totalAmount - paidAmount;

                        if (outstanding <= 0) return;

                        const rawDate = inv.sale_date || String(inv.created_at || '').split('T')[0];
                        const invDate = new Date(rawDate ? (rawDate.includes('T') ? rawDate : rawDate + 'T12:00:00') : Date.now());
                        const diffTime = Math.max(0, today.getTime() - invDate.getTime());
                        const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                        if (!customerAgingMap[custName]) {
                            customerAgingMap[custName] = {
                                customer_name: custName,
                                total_due: 0,
                                days_0_30: 0,
                                days_31_60: 0,
                                days_61_90: 0,
                                days_90_plus: 0,
                                invoice_count: 0
                            };
                        }

                        const entry = customerAgingMap[custName];
                        entry.total_due += outstanding;
                        entry.invoice_count += 1;

                        if (daysOverdue <= 30) {
                            entry.days_0_30 += outstanding;
                        } else if (daysOverdue <= 60) {
                            entry.days_31_60 += outstanding;
                        } else if (daysOverdue <= 90) {
                            entry.days_61_90 += outstanding;
                        } else {
                            entry.days_90_plus += outstanding;
                        }
                    });

                    const agingRows = Object.values(customerAgingMap);
                    setReportRows(agingRows);
                }

                // --- 📊 TAB 3: VENDOR BALANCE DETAIL REPORT ---
                else if (activeTab === 3) {
                    const [vendRes, purRes, vchRes, pretRes] = await Promise.all([
                        supabase.from('vendors').select('*'),
                        supabase.from('supplier_purchases').select('*').order('id', { ascending: true }),
                        supabase.from('financial_vouchers').select('*'),
                        supabase.from('purchase_returns').select('*')
                    ]);

                    let allVendors = vendRes.data || [];
                    const allPurchases = purRes.data || [];
                    const allVouchers = vchRes.data || [];
                    const allReturns = pretRes.data || [];

                    if (filters.vendor && filters.vendor.length > 0 && !filters.vendor.includes('All')) {
                        const rawFilterList = Array.isArray(filters.vendor) ? filters.vendor : [filters.vendor];
                        allVendors = allVendors.filter(v => rawFilterList.includes(v.vendor_name));
                    }

                    const startTimestamp = filters.dateFrom ? new Date(filters.dateFrom + 'T00:00:00').getTime() : 0;
                    const endTimestamp = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59').getTime() : Infinity;

                    const compiledVendorRows = allVendors.map(vend => {
                        const vName = (vend.vendor_name || '').trim().toLowerCase();

                        const vendPurchases = allPurchases.filter(p => (p.supplier_name || p.vendor_name || '').trim().toLowerCase() === vName);

                        const vendVouchers = allVouchers.filter(v => {
                            const vParty = (v.supplier_name || v.vendor_name || v.customer_name || v.customerName || v.metadata?.vendor_name || v.metadata?.party_name || '').trim().toLowerCase();
                            const isPaymentType = !v.voucher_type ||
                                v.voucher_type.toLowerCase().includes('payment') ||
                                v.voucher_type.toLowerCase().includes('bpv') ||
                                v.voucher_type.toLowerCase().includes('cpv');
                            if (!isPaymentType) return false;
                            return vParty === vName;
                        });

                        const vendReturns = allReturns.filter(r => (r.supplier_name || r.vendor_name || '').trim().toLowerCase() === vName);

                        let openingCredit = 0; // Purchases (Payable)
                        let openingDebit = 0;  // Payments / Debit Notes (Reduces Payable)

                        vendPurchases.forEach(pur => {
                            const d = pur.purchase_date || pur.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            if (t < startTimestamp) {
                                const totAmt = Number(pur.total_amount || 0);
                                const upfrontPaid = Number(pur.amount_paid || pur.paid_amount || pur.cash_amount_paid || pur.cash_paid || 0);
                                openingCredit += totAmt;
                                openingDebit += upfrontPaid;
                            }
                        });

                        vendVouchers.forEach(vch => {
                            const d = vch.voucher_date || vch.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            if (t < startTimestamp) {
                                openingDebit += Number(vch.total_amount || vch.amount || 0);
                            }
                        });

                        vendReturns.forEach(ret => {
                            const d = ret.return_date || ret.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            if (t < startTimestamp) {
                                openingDebit += Number(ret.total_amount || 0);
                            }
                        });

                        const openingBalance = openingCredit - openingDebit;

                        let periodCredit = 0; // Purchases
                        let periodDebit = 0;  // Payments
                        let txCount = 0;

                        vendPurchases.forEach(pur => {
                            const d = pur.purchase_date || pur.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            if (t >= startTimestamp && t <= endTimestamp) {
                                const totAmt = Number(pur.total_amount || 0);
                                const upfrontPaid = Number(pur.amount_paid || pur.paid_amount || pur.cash_amount_paid || pur.cash_paid || 0);
                                periodCredit += totAmt;
                                periodDebit += upfrontPaid;
                                txCount++;
                            }
                        });

                        vendVouchers.forEach(vch => {
                            const d = vch.voucher_date || vch.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            if (t >= startTimestamp && t <= endTimestamp) {
                                periodDebit += Number(vch.total_amount || vch.amount || 0);
                                txCount++;
                            }
                        });

                        vendReturns.forEach(ret => {
                            const d = ret.return_date || ret.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            if (t >= startTimestamp && t <= endTimestamp) {
                                periodDebit += Number(ret.total_amount || 0);
                                txCount++;
                            }
                        });

                        const closingBalance = openingBalance + periodCredit - periodDebit;

                        // Assemble Chronological Transactions Ledger
                        const rawTransactions: Array<{
                            date: string;
                            raw_date: string;
                            type: string;
                            refNo: string;
                            notes: string;
                            debit: number;
                            credit: number;
                        }> = [];

                        // Beginning / Opening Balance line (Always shown as initial vendor ledger line)
                        rawTransactions.push({
                            date: filters.dateFrom || 'Opening',
                            raw_date: filters.dateFrom ? filters.dateFrom + 'T00:00:00' : '1970-01-01',
                            type: 'Beginning Balance (B/F)',
                            refNo: '-',
                            notes: 'Beginning / Opening Balance Brought Forward',
                            debit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
                            credit: openingBalance > 0 ? openingBalance : 0,
                        });

                        vendPurchases.forEach(pur => {
                            const d = pur.purchase_date || pur.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            if (t >= startTimestamp && t <= endTimestamp) {
                                rawTransactions.push({
                                    date: String(d).split('T')[0],
                                    raw_date: String(d),
                                    type: 'Purchase Bill',
                                    refNo: pur.purchase_no || `PUR-${pur.id}`,
                                    notes: pur.warehouse ? `Warehouse: ${pur.warehouse}` : 'Inventory Purchase',
                                    credit: Number(pur.total_amount || 0),
                                    debit: Number(pur.amount_paid || pur.paid_amount || pur.cash_amount_paid || pur.cash_paid || 0)
                                });
                            }
                        });

                        vendVouchers.forEach(vch => {
                            const d = vch.voucher_date || vch.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            if (t >= startTimestamp && t <= endTimestamp) {
                                rawTransactions.push({
                                    date: String(d).split('T')[0],
                                    raw_date: String(d),
                                    type: 'Payment Voucher',
                                    refNo: vch.voucher_no || `CPV-${vch.id}`,
                                    notes: vch.notes || vch.narration || (vch.payment_mode ? `Paid via ${vch.payment_mode}` : 'Supplier Payout'),
                                    credit: 0,
                                    debit: Number(vch.total_amount || vch.amount || 0)
                                });
                            }
                        });

                        vendReturns.forEach(ret => {
                            const d = ret.return_date || ret.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            if (t >= startTimestamp && t <= endTimestamp) {
                                rawTransactions.push({
                                    date: String(d).split('T')[0],
                                    raw_date: String(d),
                                    type: 'Purchase Return (Debit Note)',
                                    refNo: ret.return_no || `PRTN-${ret.id}`,
                                    notes: ret.notes || 'Goods Returned to Vendor',
                                    credit: 0,
                                    debit: Number(ret.total_amount || 0)
                                });
                            }
                        });

                        rawTransactions.sort((a, b) => new Date(a.raw_date).getTime() - new Date(b.raw_date).getTime());

                        let currentRunningBal = 0;
                        const itemizedTransactions = rawTransactions.map(tx => {
                            currentRunningBal += (tx.credit - tx.debit);
                            return {
                                ...tx,
                                runningBalance: currentRunningBal
                            };
                        });

                        return {
                            id: vend.id,
                            vendor_name: vend.vendor_name,
                            phone: vend.phone || vend.contact_number || vend.mobile || '-',
                            address: vend.address || '-',
                            opening_balance: openingBalance,
                            period_credit: periodCredit, // Purchases
                            period_debit: periodDebit,   // Payments
                            closing_balance: closingBalance,
                            tx_count: txCount,
                            transactions: itemizedTransactions
                        };
                    });

                    let finalRows = compiledVendorRows;
                    if (filters.showZeroValues === false) {
                        finalRows = finalRows.filter(r => r.period_credit > 0.01 || r.period_debit > 0.01 || r.tx_count > 0);
                    }
                    finalRows.sort((a, b) => a.vendor_name.localeCompare(b.vendor_name));
                    setReportRows(finalRows);
                }

                // --- 📊 TAB 6: PROCUREMENT VENDOR OUTSTANDING BILLS ---
                else if (activeTab === 6) {
                    const { data: purchasesData, error: purchaseErr } = await supabase
                        .from('supplier_purchases')
                        .select('*')
                        .order('id', { ascending: true });

                    if (purchaseErr) throw purchaseErr;

                    const { data: vouchersData, error: voucherErr } = await supabase
                        .from('financial_vouchers')
                        .select('voucher_no, original_invoice_no, total_amount');

                    if (voucherErr) throw voucherErr;

                    let pool = purchasesData || [];

                    const selectedVendors = filters.supplier || filters.vendor;
                    if (selectedVendors && selectedVendors.length > 0 && !selectedVendors.includes('All')) {
                        const vendorList = Array.isArray(selectedVendors) ? selectedVendors : [selectedVendors];
                        pool = pool.filter(row => vendorList.includes(row.supplier_name || row.vendor_name));
                    }

                    if (filters.dateFrom && filters.dateTo) {
                        const startTimestamp = new Date(filters.dateFrom + 'T00:00:00').getTime();
                        const endTimestamp = new Date(filters.dateTo + 'T23:59:59').getTime();

                        pool = pool.filter(row => {
                            const rawRowDate = row.purchase_date || String(row.created_at || '').split('T')[0];
                            if (!rawRowDate) return false;
                            const rowTimestamp = new Date(String(rawRowDate).includes('T') ? String(rawRowDate) : String(rawRowDate) + 'T12:00:00').getTime();
                            return rowTimestamp >= startTimestamp && rowTimestamp <= endTimestamp;
                        });
                    }

                    let calculatedVendorOutstandingRows = pool.map(p => {
                        const grossBillTotal = Number(p.total_amount || 0);
                        const amountPaidUpfront = Number(p.amount_paid || p.paid_amount || p.cash_amount_paid || p.cash_paid || 0);

                        const currentPurchaseNo = String(p.purchase_no || `PUR-0900${p.id}`).toUpperCase().trim();
                        const rawPurchaseId = String(p.id).trim();

                        const subsequentReceipts = (vouchersData || []).filter(v => {
                            const cleanVoucherNo = String(v.voucher_no || '').toUpperCase().trim();
                            const cleanInvoiceNo = String(v.original_invoice_no || '').toUpperCase().trim();

                            return (
                                cleanVoucherNo === currentPurchaseNo ||
                                cleanVoucherNo.includes(currentPurchaseNo) ||
                                cleanInvoiceNo === currentPurchaseNo ||
                                cleanInvoiceNo.includes(currentPurchaseNo) ||
                                cleanVoucherNo.includes(rawPurchaseId)
                            );
                        });

                        const totalSubsequentReceiptsSum = subsequentReceipts.reduce((sum, v) => sum + Number(v.total_amount || 0), 0);
                        const trueNetCreditDebtRemaining = Math.max(0, grossBillTotal - amountPaidUpfront - totalSubsequentReceiptsSum);

                        return {
                            ...p,
                            gross_amount: grossBillTotal,
                            paid_amount: amountPaidUpfront + totalSubsequentReceiptsSum,
                            total_amount: trueNetCreditDebtRemaining
                        };
                    });

                    // Hide fully settled bills if showZeroValues is false
                    if (filters.showZeroValues === false) {
                        calculatedVendorOutstandingRows = calculatedVendorOutstandingRows.filter(r => r.total_amount > 0.01);
                    }

                    // Apply sorting
                    if (filters.sortBy === 'date_desc') {
                        calculatedVendorOutstandingRows.sort((a, b) => new Date(b.purchase_date || b.created_at).getTime() - new Date(a.purchase_date || a.created_at).getTime());
                    } else if (filters.sortBy === 'date_asc') {
                        calculatedVendorOutstandingRows.sort((a, b) => new Date(a.purchase_date || a.created_at).getTime() - new Date(b.purchase_date || b.created_at).getTime());
                    } else if (filters.sortBy === 'amount_desc') {
                        calculatedVendorOutstandingRows.sort((a, b) => Number(b.total_amount) - Number(a.total_amount));
                    } else if (filters.sortBy === 'amount_asc') {
                        calculatedVendorOutstandingRows.sort((a, b) => Number(a.total_amount) - Number(b.total_amount));
                    }

                    setReportRows(calculatedVendorOutstandingRows);
                }

                // --- 📊 TAB 4: ENTERPRISE INCOME STATEMENT / P&L ---
                // --- 📊 TAB 4: OPERATIONAL EXPENSE STATEMENT & EXPENDITURE AUDIT ---
                else if (activeTab === 4) {
                    const { data: vouchers, error: vErr } = await supabase
                        .from('financial_vouchers')
                        .select('*')
                        .order('id', { ascending: false });

                    if (vErr) throw vErr;

                    // Filter to expense vouchers (CPV, BPV, Expense or account_code starting with '5')
                    let expPool = (vouchers || []).filter(v => {
                        const typeStr = String(v.voucher_type || '').toLowerCase();
                        const codeStr = String(v.account_code || '');
                        const nameStr = String(v.account_name || '').toLowerCase();
                        
                        const isExpenseType = typeStr.includes('payment') || typeStr.includes('expense') || typeStr.includes('cpv') || typeStr.includes('bpv');
                        const isExpenseCode = codeStr.startsWith('5') || codeStr.startsWith('6');
                        const isExpenseName = nameStr.includes('expense') || nameStr.includes('rent') || nameStr.includes('salary') || nameStr.includes('salaries') || nameStr.includes('utility') || nameStr.includes('electricity') || nameStr.includes('fuel') || nameStr.includes('stationery') || nameStr.includes('freight');
                        
                        return isExpenseType || isExpenseCode || isExpenseName;
                    });

                    if (filters.dateFrom && filters.dateTo) {
                        const startStr = String(filters.dateFrom).split('T')[0];
                        const endStr = String(filters.dateTo).split('T')[0];

                        expPool = expPool.filter(row => {
                            const rawRowDate = String(row.voucher_date || row.created_at || '').split('T')[0];
                            if (!rawRowDate) return false;
                            return rawRowDate >= startStr && rawRowDate <= endStr;
                        });
                    }

                    if (filters.voucherType && filters.voucherType !== 'All') {
                        expPool = expPool.filter(row => row.voucher_type === filters.voucherType);
                    }

                    setReportRows(expPool);
                }

                // --- 📊 TAB 5: CHART OF ACCOUNTS STRUCTURAL CATALOG ---
                else if (activeTab === 5) {
                    let query = supabase.from('chart_of_accounts').select('*');
                    if (filters.categoryCode && filters.categoryCode !== 'All') query = query.eq('category_code', filters.categoryCode);
                    if (filters.controlCode && filters.controlCode !== 'All') query = query.eq('control_code', filters.controlCode);
                    if (filters.chartOfAccountCode && filters.chartOfAccountCode !== 'All') query = query.eq('account_code', filters.chartOfAccountCode);

                    const { data, error } = await query;
                    if (error) throw error;
                    setReportRows(data || []);
                }

                // --- 📊 TAB 11: GENERAL TRIAL BALANCE AUDIT WORKBOOK ---
                else if (activeTab === 11) {
                    const { data: sales } = await supabase.from('sales_invoices').select('*');
                    const { data: purchases } = await supabase.from('supplier_purchases').select('*');
                    const { data: sReturns } = await supabase.from('sales_returns').select('*');
                    const { data: pReturns } = await supabase.from('purchase_returns').select('*');
                    const { data: vouchers } = await supabase.from('financial_vouchers').select('*');
                    const { data: banks } = await supabase.from('banks').select('*');
                    const { data: products } = await supabase.from('products').select('*');

                    const grossSalesSum = (sales || []).reduce((acc, s) => acc + Number(s.total_amount || 0), 0);
                    const salesReturnsSum = (sReturns || []).reduce((acc, r) => acc + Number(r.payout_amount_paid || r.total_amount || 0), 0);
                    const grossPurchasesSum = (purchases || []).reduce((acc, p) => acc + Number(p.total_amount || 0), 0);
                    const purchaseReturnsSum = (pReturns || []).reduce((acc, r) => acc + Number(r.amount_received || r.total_amount || 0), 0);

                    let totalReceivables = 0;
                    (sales || []).forEach(s => {
                        const tot = Number(s.total_amount || 0);
                        const paid = Number(s.cash_amount_paid || s.amount_paid || 0);
                        if (tot > paid) totalReceivables += (tot - paid);
                    });

                    let totalPayables = 0;
                    (purchases || []).forEach(p => {
                        const tot = Number(p.total_amount || 0);
                        const paid = Number(p.amount_paid_now || p.paid_amount || 0);
                        if (tot > paid) totalPayables += (tot - paid);
                    });

                    let cashInflow = 0;
                    let cashOutflow = 0;
                    (sales || []).forEach(s => { cashInflow += Number(s.cash_amount_paid || s.amount_paid || 0); });
                    (purchases || []).forEach(p => { cashOutflow += Number(p.amount_paid_now || p.paid_amount || 0); });
                    (vouchers || []).forEach(v => {
                        const amt = Number(v.total_amount || 0);
                        const vType = String(v.voucher_type || '').toLowerCase();
                        if (vType.includes('receipt')) cashInflow += amt;
                        if (vType.includes('payment')) cashOutflow += amt;
                    });
                    const netCashBox = Math.max(0, cashInflow - cashOutflow);

                    const totalBankLedgers = (banks || []).reduce((acc, b) => acc + Number(b.openingBalance || 0), 0);

                    let totalInventoryValue = 0;
                    (products || []).forEach(p => {
                        const qty = Number(p.current_stock || 0);
                        const price = Number(p.retail_price || p.purchase_price || 0);
                        totalInventoryValue += qty * price;
                    });

                    const totalDebitsWithoutEquity = netCashBox + totalBankLedgers + totalReceivables + totalInventoryValue + salesReturnsSum + grossPurchasesSum;
                    const totalCreditsWithoutEquity = totalPayables + grossSalesSum + purchaseReturnsSum;
                    const totalEquityVal = Math.max(0, totalDebitsWithoutEquity - totalCreditsWithoutEquity);

                    // --- Construct Detailed Sub-Ledgers for Each Trial Balance Head ---
                    const cashDetails = [
                        { name: 'Customer Sales Direct Cash Inflow', ref: 'Cash Sales', debit: cashInflow, credit: 0, balance: cashInflow },
                        { name: 'Supplier Direct Cash Outflow / Payouts', ref: 'Purchases / Expenses', debit: 0, credit: cashOutflow, balance: -cashOutflow },
                    ];

                    const bankDetails = (banks || []).map((b: any) => ({
                        name: `${b.bank_name || b.name || 'Corporate Bank'} (${b.account_number || '-'})`,
                        ref: b.branch_name || b.iban || 'Main Branch',
                        debit: Number(b.openingBalance || 0) >= 0 ? Number(b.openingBalance || 0) : 0,
                        credit: Number(b.openingBalance || 0) < 0 ? Math.abs(Number(b.openingBalance || 0)) : 0,
                        balance: Number(b.openingBalance || 0)
                    }));

                    const customerReceivablesMap: Record<string, number> = {};
                    (sales || []).forEach(s => {
                        const tot = Number(s.total_amount || 0);
                        const paid = Number(s.cash_amount_paid || s.amount_paid || 0);
                        if (tot > paid) {
                            const cName = s.customer_name || 'Walking Customer';
                            customerReceivablesMap[cName] = (customerReceivablesMap[cName] || 0) + (tot - paid);
                        }
                    });
                    const customerReceivableDetails = Object.entries(customerReceivablesMap).map(([name, bal]) => ({
                        name: `Debtor: ${name}`,
                        ref: 'Unpaid Invoices',
                        debit: bal,
                        credit: 0,
                        balance: bal
                    }));

                    const stockCategoryMap: Record<string, { count: number; val: number }> = {};
                    (products || []).forEach(p => {
                        const cat = p.category || p.parent_category || 'General Products';
                        const qty = Number(p.current_stock || 0);
                        const price = Number(p.retail_price || p.purchase_price || 0);
                        if (!stockCategoryMap[cat]) stockCategoryMap[cat] = { count: 0, val: 0 };
                        stockCategoryMap[cat].count += qty;
                        stockCategoryMap[cat].val += qty * price;
                    });
                    const inventoryDetails = Object.entries(stockCategoryMap).map(([cat, info]) => ({
                        name: `Stock Category: ${cat}`,
                        ref: `${info.count} Units in Stock`,
                        debit: info.val,
                        credit: 0,
                        balance: info.val
                    }));

                    const supplierPayablesMap: Record<string, number> = {};
                    (purchases || []).forEach(p => {
                        const tot = Number(p.total_amount || 0);
                        const paid = Number(p.amount_paid_now || p.paid_amount || 0);
                        if (tot > paid) {
                            const sName = p.supplier_name || p.vendor_name || 'Vendor';
                            supplierPayablesMap[sName] = (supplierPayablesMap[sName] || 0) + (tot - paid);
                        }
                    });
                    const supplierPayableDetails = Object.entries(supplierPayablesMap).map(([name, bal]) => ({
                        name: `Creditor: ${name}`,
                        ref: 'Unsettled Bills',
                        debit: 0,
                        credit: bal,
                        balance: bal
                    }));

                    const equityDetails = [
                        { name: 'Gross Commercial Assets Valuation', ref: 'Total Assets (Dr)', debit: totalDebitsWithoutEquity, credit: 0, balance: totalDebitsWithoutEquity },
                        { name: 'Less: Outside Operational Liabilities', ref: 'Total Liabilities (Cr)', debit: 0, credit: totalCreditsWithoutEquity, balance: -totalCreditsWithoutEquity },
                        { name: 'Net Shareholder / Retained Equity Pool', ref: 'Net Worth', debit: 0, credit: totalEquityVal, balance: totalEquityVal }
                    ];

                    const salesDetails = [
                        { name: 'Gross Billed Commercial Invoices', ref: `${sales?.length || 0} Invoices`, debit: 0, credit: grossSalesSum, balance: grossSalesSum }
                    ];

                    const salesReturnDetails = [
                        { name: 'Customer Sales Returns & Adjustments', ref: `${sReturns?.length || 0} Credit Notes`, debit: salesReturnsSum, credit: 0, balance: salesReturnsSum }
                    ];

                    const purchaseDetails = [
                        { name: 'Total Supplier Purchases Billed', ref: `${purchases?.length || 0} Bills`, debit: grossPurchasesSum, credit: 0, balance: grossPurchasesSum }
                    ];

                    const purchaseReturnDetails = [
                        { name: 'Returned Supplier Merchandise', ref: `${pReturns?.length || 0} Debit Notes`, debit: 0, credit: purchaseReturnsSum, balance: purchaseReturnsSum }
                    ];

                    let trialBalanceRows = [
                        { id: '1010', code: '1010', title: 'Cash Box / App Liquid Drawer', category: 'A-ASSETS', debit: netCashBox, credit: 0, details: cashDetails },
                        { id: '1020', code: '1020', title: 'Corporate Bank Ledgers & Accounts', category: 'A-ASSETS', debit: totalBankLedgers, credit: 0, details: bankDetails },
                        { id: '1030', code: '1030', title: 'Accounts Receivable (Customer Credit Bills)', category: 'A-ASSETS', debit: totalReceivables, credit: 0, details: customerReceivableDetails },
                        { id: '1040', code: '1040', title: 'Merchandise Inventory Stock Valuation', category: 'A-ASSETS', debit: totalInventoryValue, credit: 0, details: inventoryDetails },
                        { id: '2010', code: '2010', title: 'Accounts Payable (Supplier Credit Unpaid Bills)', category: 'LIABILITIES', debit: 0, credit: totalPayables, details: supplierPayableDetails },
                        { id: '3010', code: '3010', title: 'Owner\'s Capital & Retained Earnings Pool', category: 'EQUITY', debit: 0, credit: totalEquityVal, details: equityDetails },
                        { id: '4010', code: '4010', title: 'Gross Commercial Sales Operating Revenue', category: 'REVENUE', debit: 0, credit: grossSalesSum, details: salesDetails },
                        { id: '4020', code: '4020', title: 'Sales Returns & Credit Allowances', category: 'CONTRA-REVENUE', debit: salesReturnsSum, credit: 0, details: salesReturnDetails },
                        { id: '5010', code: '5010', title: 'Cost of Goods Sold & Direct Procurements', category: 'EXPENSE', debit: grossPurchasesSum, credit: 0, details: purchaseDetails },
                        { id: '5020', code: '5020', title: 'Purchase Returns & Supplier Allowance Credits', category: 'CONTRA-EXPENSE', debit: 0, credit: purchaseReturnsSum, details: purchaseReturnDetails },
                    ];

                    if (filters.categoryCode && filters.categoryCode.length > 0 && !filters.categoryCode.includes('All')) {
                        const cFilter = String(filters.categoryCode).trim().toLowerCase();
                        trialBalanceRows = trialBalanceRows.filter(r => {
                            const rCat = String(r.category).trim().toLowerCase();
                            const rCode = String(r.code).trim().toLowerCase();
                            return rCat.includes(cFilter) || cFilter.includes(rCat) || rCode.startsWith(cFilter);
                        });
                    }

                    setReportRows(trialBalanceRows);
                }

                // --- 📊 TAB 7: CUSTOMER RECOVERY COLLECTION STATEMENT ---
                else if (activeTab === 7) {
                    let query = supabase
                        .from('financial_vouchers')
                        .select('*')
                        .eq('voucher_type', 'Cash Receipt Voucher')
                        .order('id', { ascending: true });

                    if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) {
                        query = query.in('customer_name', filters.customer);
                    }

                    const { data, error } = await query;
                    if (error) throw error;

                    let pool = data || [];

                    if (filters.dateFrom && filters.dateTo) {
                        const startStr = filters.dateFrom;
                        const endStr = filters.dateTo;

                        pool = pool.filter(row => {
                            const dateRaw = row.voucher_date || row.created_at || '';
                            if (!dateRaw) return false;

                            const cleanRowStr = String(dateRaw).includes('T')
                                ? String(dateRaw).split('T')[0]
                                : String(dateRaw).split(' ')[0];

                            return cleanRowStr >= startStr && cleanRowStr <= endStr;
                        });
                    }

                    setReportRows(pool);
                }

                // --- 📊 TAB 8: CORPORATE VOUCHER AUDIT LOG ---
                else if (activeTab === 8) {
                    let query = supabase
                        .from('financial_vouchers')
                        .select('*')
                        .order('id', { ascending: true });

                    const { data, error } = await query;
                    if (error) throw error;

                    let pool = data || [];

                    if (filters.voucherType && filters.voucherType.length > 0) {
                        const types = Array.isArray(filters.voucherType) ? filters.voucherType : [filters.voucherType];
                        if (!types.includes('All')) {
                            pool = pool.filter(row => {
                                const rowType = String(row.voucher_type || '').toLowerCase();
                                return types.some(t => {
                                    const vFilter = String(t).toLowerCase();
                                    if (vFilter.includes('payment') || vFilter.includes('cpv')) {
                                        return rowType.includes('payment') || rowType.includes('cpv');
                                    }
                                    if (vFilter.includes('receipt') || vFilter.includes('crv')) {
                                        return rowType.includes('receipt') || rowType.includes('crv');
                                    }
                                    if (vFilter.includes('bank payment') || vFilter.includes('bpv')) {
                                        return rowType.includes('bpv') || (rowType.includes('bank') && rowType.includes('payment'));
                                    }
                                    if (vFilter.includes('bank receipt') || vFilter.includes('brv')) {
                                        return rowType.includes('brv') || (rowType.includes('bank') && rowType.includes('receipt'));
                                    }
                                    if (vFilter.includes('journal') || vFilter.includes('jv')) {
                                        return rowType.includes('journal') || rowType.includes('jv');
                                    }
                                    return rowType.includes(vFilter) || vFilter.includes(rowType);
                                });
                            });
                        }
                    }

                    if (filters.dateFrom && filters.dateTo) {
                        const startStr = filters.dateFrom;
                        const endStr = filters.dateTo;

                        pool = pool.filter(row => {
                            const dateRaw = row.voucher_date || row.created_at || '';
                            if (!dateRaw) return false;

                            const cleanRowStr = String(dateRaw).includes('T')
                                ? String(dateRaw).split('T')[0]
                                : String(dateRaw).split(' ')[0];

                            return cleanRowStr >= startStr && cleanRowStr <= endStr;
                        });
                    }

                    if (filters.sortBy === 'amount_desc') {
                        pool.sort((a, b) => Number(b.total_amount || b.amount || 0) - Number(a.total_amount || a.amount || 0));
                    } else if (filters.sortBy === 'amount_asc') {
                        pool.sort((a, b) => Number(a.total_amount || a.amount || 0) - Number(b.total_amount || b.amount || 0));
                    } else if (filters.sortBy === 'invoice_asc') {
                        pool.sort((a, b) => String(a.voucher_no || a.id).localeCompare(String(b.voucher_no || b.id)));
                    } else if (filters.sortBy === 'date_asc') {
                        pool.sort((a, b) => new Date(a.voucher_date || a.created_at).getTime() - new Date(b.voucher_date || b.created_at).getTime());
                    } else {
                        pool.sort((a, b) => new Date(b.voucher_date || b.created_at).getTime() - new Date(a.voucher_date || a.created_at).getTime());
                    }

                    setReportRows(pool);
                }

                // --- 📊 TAB 9: DAILY CASH & BANK DAYBOOK ---
                else if (activeTab === 9) {
                    const [salesRes, purRes, vchRes] = await Promise.all([
                        supabase.from('sales_invoices').select('*'),
                        supabase.from('supplier_purchases').select('*'),
                        supabase.from('financial_vouchers').select('*').order('id', { ascending: true })
                    ]);

                    const allSales = salesRes.data || [];
                    const allPurchases = purRes.data || [];
                    const allVouchers = vchRes.data || [];

                    const startTimestamp = filters.dateFrom ? new Date(filters.dateFrom + 'T00:00:00').getTime() : 0;
                    const endTimestamp = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59').getTime() : Infinity;

                    let unifiedEntries: any[] = [];

                    // 1. Customer Direct Cash / Upfront Paid at time of Sale
                    allSales.forEach(s => {
                        const paidAmt = Number(s.cash_amount_paid || s.amount_paid || s.paid_amount || 0);
                        if (paidAmt > 0) {
                            const d = s.sale_date || s.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            const cleanDate = d ? (String(d).includes('T') ? String(d).split('T')[0] : String(d).split(' ')[0]) : '';
                            unifiedEntries.push({
                                timestamp: t,
                                date: cleanDate,
                                doc_no: s.invoice_no || `INV-${String(s.id).padStart(4, '0')}`,
                                type: 'Customer Cash Sale / Receipt',
                                party: s.customer_name || 'Walk-in / Cash Customer',
                                payment_mode: s.payment_method || (s.bank_account ? 'Bank' : 'Cash'),
                                narration: `Direct sale payment received on Invoice #${s.invoice_no || s.id}`,
                                cash_in: paidAmt,
                                cash_out: 0
                            });
                        }
                    });

                    // 2. Vendor Direct Cash / Upfront Paid at time of Purchase
                    allPurchases.forEach(p => {
                        const paidAmt = Number(p.amount_paid || p.paid_amount || p.cash_amount_paid || p.cash_paid || 0);
                        if (paidAmt > 0) {
                            const d = p.purchase_date || p.created_at;
                            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                            const cleanDate = d ? (String(d).includes('T') ? String(d).split('T')[0] : String(d).split(' ')[0]) : '';
                            unifiedEntries.push({
                                timestamp: t,
                                date: cleanDate,
                                doc_no: p.purchase_no || p.bill_no || `PUR-${String(p.id).padStart(4, '0')}`,
                                type: 'Supplier Purchase Payment',
                                party: p.supplier_name || p.vendor_name || 'Vendor',
                                payment_mode: p.payment_method || (p.bank_name ? 'Bank' : 'Cash'),
                                narration: `Upfront payment made for Purchase Bill #${p.purchase_no || p.id}`,
                                cash_in: 0,
                                cash_out: paidAmt
                            });
                        }
                    });

                    // 3. Financial Vouchers (CRV, BRV, CPV, BPV, JV)
                    allVouchers.forEach(v => {
                        const d = v.voucher_date || v.created_at;
                        const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
                        const cleanDate = d ? (String(d).includes('T') ? String(d).split('T')[0] : String(d).split(' ')[0]) : '';
                        const vType = String(v.voucher_type || v.voucherType || '').toUpperCase();
                        const amt = Number(v.total_amount || v.amount_paid || v.amount || 0);

                        if (amt > 0) {
                            const isReceipt = vType.includes('RECEIPT') || vType.includes('CRV') || vType.includes('BRV') || vType.includes('COLLECTION');
                            const isPayment = vType.includes('PAYMENT') || vType.includes('CPV') || vType.includes('BPV') || vType.includes('EXPENSE');

                            let pMode = 'Cash';
                            if (vType.includes('BPV') || vType.includes('BRV') || vType.includes('BANK') || v.bank_account || v.bank_name) {
                                pMode = 'Bank';
                            }

                            const partyName = v.customer_name || v.supplier_name || v.vendor_name || v.paid_to || v.beneficiary || v.account_title || v.account_head || 'General Entry';

                            unifiedEntries.push({
                                timestamp: t,
                                date: cleanDate,
                                doc_no: v.voucher_no || `VCH-00${v.id}`,
                                type: v.voucher_type || 'Financial Voucher',
                                party: partyName,
                                payment_mode: pMode,
                                narration: v.narration || v.notes || v.remarks || 'Voucher transaction',
                                cash_in: isReceipt ? amt : (!isPayment ? amt : 0),
                                cash_out: isPayment ? amt : 0
                            });
                        }
                    });

                    // Sort chronologically
                    unifiedEntries.sort((a, b) => a.timestamp - b.timestamp);

                    // Filter by Daybook Date and calculate running balance with Opening B/F
                    let openingBalance = 0;
                    unifiedEntries.forEach(entry => {
                        if (entry.timestamp < startTimestamp) {
                            openingBalance += (entry.cash_in - entry.cash_out);
                        }
                    });

                    let runningBal = openingBalance;
                    const finalDaybookRows: any[] = [];

                    // If a start date is set and there's an opening balance, show B/F row at top
                    if (startTimestamp > 0 && Math.abs(openingBalance) > 0.001) {
                        finalDaybookRows.push({
                            timestamp: startTimestamp - 1,
                            date: filters.dateFrom,
                            doc_no: 'B/F',
                            type: 'Opening Balance (B/F)',
                            party: 'Cash & Bank Balance B/F',
                            payment_mode: 'B/F',
                            narration: 'Opening Cash & Bank balance brought forward from previous day',
                            cash_in: openingBalance > 0 ? openingBalance : 0,
                            cash_out: openingBalance < 0 ? Math.abs(openingBalance) : 0,
                            balance: openingBalance,
                            is_bf: true
                        });
                    }

                    let periodEntries: any[] = [];
                    unifiedEntries.forEach(entry => {
                        if (entry.timestamp >= startTimestamp && entry.timestamp <= endTimestamp) {
                            periodEntries.push(entry);
                        }
                    });

                    if (filters.sortBy === 'amount_desc') {
                        periodEntries.sort((a, b) => Math.max(b.cash_in, b.cash_out) - Math.max(a.cash_in, a.cash_out));
                    } else if (filters.sortBy === 'amount_asc') {
                        periodEntries.sort((a, b) => Math.max(a.cash_in, a.cash_out) - Math.max(b.cash_in, b.cash_out));
                    } else if (filters.sortBy === 'invoice_asc') {
                        periodEntries.sort((a, b) => String(a.doc_no || '').localeCompare(String(b.doc_no || '')));
                    } else {
                        periodEntries.sort((a, b) => a.timestamp - b.timestamp);
                    }

                    periodEntries.forEach(entry => {
                        runningBal += (entry.cash_in - entry.cash_out);
                        finalDaybookRows.push({
                            ...entry,
                            balance: runningBal
                        });
                    });

                    setReportRows(finalDaybookRows);
                }

                // --- 📊 TAB 10: SALESMAN SALES & CASH COLLECTION ---
                else if (activeTab === 10) {
                    const { data: salesData } = await supabase.from('sales_invoices').select('*');
                    const { data: vouchersData } = await supabase.from('financial_vouchers').select('*');

                    let unifiedRows: any[] = [];

                    (salesData || []).forEach(s => {
                        unifiedRows.push({
                            id: `INV-${s.id}`,
                            doc_ref: `INV-${String(s.id).padStart(4, '0')}`,
                            entry_type: 'Sales Invoice',
                            salesman: s.salesman || 'Direct',
                            customer_name: s.customer_name || 'Retail Client',
                            raw_date: s.sale_date || String(s.created_at || '').split('T')[0],
                            sale_amount: Number(s.total_amount || 0),
                            collected_amount: Number(s.cash_amount_paid || s.amount_paid || 0),
                            narration: `Commercial Invoice Sale (${s.payment_term || 'Credit'})`
                        });
                    });

                    (vouchersData || []).forEach(v => {
                        const vType = String(v.voucher_type || v.voucherType || '').toLowerCase();
                        if (vType.includes('receipt') || vType.includes('crv') || vType.includes('recovery')) {
                            unifiedRows.push({
                                id: `REC-${v.id}`,
                                doc_ref: v.voucher_no || `REC-${String(v.id).padStart(4, '0')}`,
                                entry_type: 'Cash Recovery Collection',
                                salesman: v.salesman || 'Direct Recovery',
                                customer_name: v.customer_name || v.customerName || 'General Account',
                                raw_date: v.voucher_date || String(v.created_at || '').split('T')[0],
                                sale_amount: 0,
                                collected_amount: Number(v.total_amount || v.amount_paid || v.net_collected_amount || 0),
                                narration: v.narration || v.notes || 'Customer Recovery Collection'
                            });
                        }
                    });

                    if (filters.salesman && filters.salesman.length > 0 && !filters.salesman.includes('All')) {
                        unifiedRows = unifiedRows.filter(r => String(r.salesman).toLowerCase() === String(filters.salesman).toLowerCase());
                    }

                    if (filters.dateFrom && filters.dateTo) {
                        const startTimestamp = new Date(filters.dateFrom + 'T00:00:00').getTime();
                        const endTimestamp = new Date(filters.dateTo + 'T23:59:59').getTime();
                        unifiedRows = unifiedRows.filter(r => {
                            if (!r.raw_date) return true;
                            const t = new Date(String(r.raw_date).includes('T') ? String(r.raw_date) : String(r.raw_date) + 'T12:00:00').getTime();
                            return t >= startTimestamp && t <= endTimestamp;
                        });
                    }

                    setReportRows(unifiedRows);
                }
            } catch (err: any) {
                console.error("Dataset Compilation Error:", err);
                toast.error(err.message || "Failed to load audit dataset");
            } finally {
                setLoading(false);
            }
        };

        compileAccountAuditingDataset();
    }, [activeTab, JSON.stringify(filters)]);

    const [exporting, setExporting] = useState(false);

    const handleExportExcel = async () => {
        if (!reportRows || reportRows.length === 0) {
            toast.error('No report data available to export');
            return;
        }
        setExporting(true);
        try {
            let columns: ExcelColumn[] = [];
            let exportData: any[] = [];
            let filename = `Account_Report_Tab_${activeTab}`;

            if (activeTab === 13) {
                filename = `Customer_Balance_Detail_Report_${new Date().toISOString().split('T')[0]}`;
                columns = [
                    { header: 'S#', key: 'sno', width: 8, alignment: { horizontal: 'center' } },
                    { header: 'Customer Code', key: 'customer_code', width: 16, alignment: { horizontal: 'center' } },
                    { header: 'Customer / Business Name', key: 'customer_name', width: 30 },
                    { header: 'Customer Category', key: 'category', width: 22 },
                    { header: 'Contact / Phone', key: 'phone', width: 18 },
                    { header: 'Opening Balance (PKR)', key: 'opening_balance', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                    { header: 'Period Debit / Sales (PKR)', key: 'period_debit', width: 25, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                    { header: 'Period Credit / Receipts (PKR)', key: 'period_credit', width: 25, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                    { header: 'Net Closing Balance (PKR)', key: 'closing_balance', width: 24, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                    { header: 'Account Status', key: 'status', width: 22, alignment: { horizontal: 'center' } },
                ];
                exportData = reportRows.map((r, i) => {
                    let status = 'Settled (0.00)';
                    if (r.closing_balance > 0.01) status = 'Debit Due (Receivable)';
                    else if (r.closing_balance < -0.01) status = 'Credit Advance (Payable)';
                    return {
                        sno: i + 1,
                        customer_code: r.customer_code || '-',
                        customer_name: r.customer_name,
                        category: r.category,
                        phone: r.phone,
                        opening_balance: Number(r.opening_balance || 0),
                        period_debit: Number(r.period_debit || 0),
                        period_credit: Number(r.period_credit || 0),
                        closing_balance: Number(r.closing_balance || 0),
                        status
                    };
                });
            } else if (activeTab === 3) {
                filename = `Vendor_Balance_Detail_Report_${new Date().toISOString().split('T')[0]}`;
                columns = [
                    { header: 'S#', key: 'sno', width: 6, alignment: { horizontal: 'center' } },
                    { header: 'Date', key: 'date', width: 14, alignment: { horizontal: 'center' } },
                    { header: 'Invoice No', key: 'refNo', width: 18 },
                    { header: 'Entry Type', key: 'type', width: 22 },
                    { header: 'Particulars / Description', key: 'notes', width: 38 },
                    { header: 'Credit / Purchases (PKR)', key: 'credit', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                    { header: 'Debit / Payments (PKR)', key: 'debit', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                    { header: 'Net Running Payable (PKR)', key: 'runningBalance', width: 24, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                ];

                const flattenedRows: any[] = [];

                reportRows.forEach((vend, vIdx) => {
                    const openBal = Number(vend.opening_balance || 0);
                    const pCredit = Number(vend.period_credit || 0);
                    const pDebit = Number(vend.period_debit || 0);
                    const closeBal = Number(vend.closing_balance || 0);
                    const txList = vend.transactions || [];

                    // 1. Vendor Header Banner Box in Excel
                    const bannerText = `🏢 ${vend.vendor_name.toUpperCase()}  |  Phone: ${vend.phone || '-'}  |  Opening: Rs. ${openBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}  |  Purchases (Cr): Rs. ${pCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}  |  Payments (Dr): Rs. ${pDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}  |  Net Closing: Rs. ${closeBal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${closeBal > 0.01 ? '(Payable/Cr)' : closeBal < -0.01 ? '(Advance/Dr)' : ''}`;

                    flattenedRows.push({
                        _isHeader: true,
                        _bannerText: bannerText
                    });

                    // 2. Transactions under this Vendor
                    if (txList.length === 0) {
                        flattenedRows.push({
                            sno: '-',
                            date: '-',
                            refNo: '-',
                            type: 'No Transactions',
                            notes: 'No procurement or payment activity logged within selected date range.',
                            credit: 0,
                            debit: 0,
                            runningBalance: closeBal
                        });
                    } else {
                        txList.forEach((tx: any, tIdx: number) => {
                            flattenedRows.push({
                                sno: tIdx + 1,
                                date: tx.date || '',
                                refNo: tx.refNo || '',
                                type: tx.type || '',
                                notes: tx.notes || '',
                                credit: Number(tx.credit || 0),
                                debit: Number(tx.debit || 0),
                                runningBalance: Number(tx.runningBalance || 0)
                            });
                        });
                    }

                    // 3. Subtotal row for this vendor
                    flattenedRows.push({
                        _isSubtotal: true,
                        sno: '',
                        date: '',
                        refNo: '',
                        type: '',
                        notes: `VENDOR PERIOD TOTAL (${vend.vendor_name}):`,
                        credit: pCredit,
                        debit: pDebit,
                        runningBalance: closeBal
                    });
                });

                exportData = flattenedRows;
            } else if (activeTab === 1) {
                filename = `Customer_Account_Ledger_${new Date().toISOString().split('T')[0]}`;
                columns = [
                    { header: 'S#', key: 'sno', width: 6, alignment: { horizontal: 'center' } },
                    { header: 'Date', key: 'date', width: 14, alignment: { horizontal: 'center' } },
                    { header: 'Invoice No', key: 'refNo', width: 18 },
                    { header: 'Entry Type', key: 'type', width: 22 },
                    { header: 'Particulars / Description', key: 'notes', width: 38 },
                    { header: 'Debit / Sales (PKR)', key: 'debit', width: 20, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                    { header: 'Credit / Recv (PKR)', key: 'credit', width: 20, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                    { header: 'Running Balance (PKR)', key: 'runningBalance', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                ];

                const flattenedRows: any[] = [];

                reportRows.forEach((cust) => {
                    const openBal = Number(cust.opening_balance || 0);
                    const pDebit = Number(cust.period_debit || 0);
                    const pCredit = Number(cust.period_credit || 0);
                    const closeBal = Number(cust.closing_balance || 0);
                    const txList = cust.transactions || [];

                    // 1. Customer Header Banner Box in Excel
                    const bannerText = `👤 ${cust.customer_name.toUpperCase()}  |  Category: ${cust.category || 'Retail / General'}  |  Phone: ${cust.phone || '-'}  |  Opening: Rs. ${openBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}  |  Sales (Dr): Rs. ${pDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}  |  Paid/Recv (Cr): Rs. ${pCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}  |  Net Closing: Rs. ${closeBal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${closeBal > 0.01 ? '(Dr)' : closeBal < -0.01 ? '(Cr)' : ''}`;
                    
                    flattenedRows.push({
                        _isHeader: true,
                        _bannerText: bannerText
                    });

                    // 2. Transactions under this Customer
                    if (txList.length === 0) {
                        flattenedRows.push({
                            sno: '-',
                            date: '-',
                            refNo: '-',
                            type: 'No Transactions',
                            notes: 'No activity logged within selected date range.',
                            debit: 0,
                            credit: 0,
                            runningBalance: closeBal
                        });
                    } else {
                        txList.forEach((tx: any, tIdx: number) => {
                            flattenedRows.push({
                                sno: tIdx + 1,
                                date: tx.date || '',
                                refNo: tx.refNo || '',
                                type: tx.type || '',
                                notes: tx.notes || '',
                                debit: Number(tx.debit || 0),
                                credit: Number(tx.credit || 0),
                                runningBalance: Number(tx.runningBalance || 0)
                            });
                        });
                    }

                    // 3. Subtotal row for this customer
                    flattenedRows.push({
                        _isSubtotal: true,
                        sno: '',
                        date: '',
                        refNo: '',
                        type: '',
                        notes: `CUSTOMER PERIOD TOTAL (${cust.customer_name}):`,
                        debit: pDebit,
                        credit: pCredit,
                        runningBalance: closeBal
                    });
                });

                exportData = flattenedRows;
            } else if (activeTab === 11) {
                filename = `General_Trial_Balance_Report_${new Date().toISOString().split('T')[0]}`;
                if (activeViewMode === 'detailed') {
                    columns = [
                        { header: 'Account / Sub-Head Code', key: 'code', width: 22, alignment: { horizontal: 'center' } },
                        { header: 'Classification / Category', key: 'category', width: 20 },
                        { header: 'Account Title / Sub-Ledger Name', key: 'title', width: 42 },
                        { header: 'Reference / Breakdown', key: 'ref', width: 30 },
                        { header: 'Debit Balance (PKR)', key: 'debit', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                        { header: 'Credit Balance (PKR)', key: 'credit', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                        { header: 'Net Balance (PKR)', key: 'balance', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                    ];
                    const flattened: any[] = [];
                    reportRows.forEach((r) => {
                        flattened.push({
                            _isHeader: true,
                            _bannerText: `ACCOUNT [${r.code}] - ${r.title.toUpperCase()} (${r.category}) | Debit: Rs. ${Number(r.debit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} | Credit: Rs. ${Number(r.credit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        });
                        (r.details || []).forEach((dt: any) => {
                            flattened.push({
                                code: r.code,
                                category: r.category,
                                title: dt.name,
                                ref: dt.ref || '-',
                                debit: Number(dt.debit || 0),
                                credit: Number(dt.credit || 0),
                                balance: Number(Math.abs(dt.balance || (dt.debit - dt.credit))),
                            });
                        });
                        flattened.push({
                            _isSubtotal: true,
                            code: '',
                            category: '',
                            title: `SUBTOTAL FOR [${r.code}] ${r.title}:`,
                            ref: '',
                            debit: Number(r.debit || 0),
                            credit: Number(r.credit || 0),
                            balance: Number(r.debit || 0) - Number(r.credit || 0),
                        });
                    });
                    exportData = flattened;
                } else {
                    columns = [
                        { header: 'S#', key: 'sno', width: 8, alignment: { horizontal: 'center' } },
                        { header: 'Account Code', key: 'code', width: 16, alignment: { horizontal: 'center' } },
                        { header: 'Classification', key: 'category', width: 20 },
                        { header: 'Account Title / Description', key: 'title', width: 44 },
                        { header: 'Debit Balance (PKR)', key: 'debit', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                        { header: 'Credit Balance (PKR)', key: 'credit', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
                    ];
                    exportData = reportRows.map((r, i) => ({
                        sno: i + 1,
                        code: r.code,
                        category: r.category,
                        title: r.title,
                        debit: Number(r.debit || 0),
                        credit: Number(r.credit || 0)
                    }));
                }
            } else {
                const first = reportRows[0] || {};
                columns = Object.keys(first).map(k => ({
                    header: k.replace(/_/g, ' ').toUpperCase(),
                    key: k,
                    width: 20
                }));
                exportData = reportRows;
            }

            const tabTitleMap: Record<number, string> = {
                1: 'CUSTOMER ACCOUNT LEDGER STATEMENT',
                2: 'CUSTOMER ACCOUNT BALANCE SUMMARY',
                3: 'VENDOR BALANCE DETAIL & ACCOUNT LEDGER',
                4: 'OPERATIONAL EXPENSE STATEMENT',
                5: 'CHART OF ACCOUNTS CATALOG',
                6: 'VENDOR OUTSTANDING BALANCES LEDGER',
                7: 'CUSTOMER RECOVERY COLLECTION STATEMENT',
                8: 'CORPORATE VOUCHERS AUDIT SUMMARY',
                9: 'DAILY CASH & BANK DAYBOOK STATEMENT',
                10: 'SALESMAN SALES & CASH COLLECTION SHEET',
                11: `GENERAL TRIAL BALANCE AUDIT WORKBOOK${activeViewMode === 'detailed' ? ' (DETAILED)' : ' (SUMMARY)'}`,
                12: 'ACCOUNT DEBIT AGING MATRIX SHEET',
                13: 'CUSTOMER BALANCE DETAIL AUDIT REPORT'
            };

            const reportHeading = tabTitleMap[activeTab] || `FINANCIAL STATEMENT - TAB ${activeTab}`;

            await exportToExcel({
                filename,
                sheetName: reportHeading.slice(0, 31),
                title: businessName || 'ZOAIB ALI & COMPANY',
                subtitle: reportHeading,
                columns,
                data: exportData
            });
            toast.success('Report exported to Excel successfully!');
        } catch (err: any) {
            console.error('Export Excel failed:', err);
            toast.error('Export failed: ' + err.message);
        } finally {
            setExporting(false);
        }
    };

    const handleShareWhatsApp = () => {
        const periodText = filters.dateFrom && filters.dateTo ? `${filters.dateFrom} to ${filters.dateTo}` : 'Current Period';
        const lines = [
            `📊 *${businessName || 'ZOAIB ALI & COMPANY'}*`,
            `💼 *Financial Account Ledger Audit Summary*`,
            `━━━━━━━━━━━━━━━━━━━━━`,
            `📅 *Period:* ${periodText}`,
            `📑 *Audited Entries:* ${reportRows.length}`,
            `━━━━━━━━━━━━━━━━━━━━━`,
            `_Automated ERP Accounts Ledger_`
        ];
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
    };

    if (loading) return <div className="flex h-64 items-center justify-center"><Spinner /></div>;
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
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-100 p-3 rounded border print-hidden-element print:hidden">
                    <button 
                        type="button" 
                        onClick={() => navigate(-1)} 
                        className="flex items-center gap-1.5 font-bold hover:underline cursor-pointer"
                    >
                        <MdArrowBack size={16} /> Back to Report Filter
                    </button>
                    <div className="flex items-center gap-2 flex-wrap">
                        {(activeTab === 3 || activeTab === 11 || activeTab === 13) && (
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
                        <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 bg-primary text-white py-1.5 px-4 rounded font-black cursor-pointer hover:bg-opacity-90 transition shadow-sm"><MdPrint size={16} /> Print Report</button>
                    </div>
                </div>

                <div className="text-center space-y-1 py-4 border-b border-double border-black">
                    <h1 className="text-xl font-black uppercase tracking-widest font-serif">ZOAIB ALI & COMPANY</h1>
                    <p className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">Master Corporate Ledger Book & Financial Audit Statement Summary</p>

                    <div className="text-[10px] pt-1 font-mono flex justify-between px-2 text-gray-600">
                        <span>Audit Sub-Categorization: <b className="text-black uppercase underline">
                            {activeTab === 1 && 'General Ledger Audit Statement'}
                            {activeTab === 2 && 'Customer Account Balance Ledger'}
                            {activeTab === 3 && 'Procurement Vendor Balance Ledger'}
                            {activeTab === 4 && 'Enterprise Income Statement / P&L'}
                            {activeTab === 5 && 'Chart of Accounts Structural Catalog'}
                            {activeTab === 6 && 'Vendor Outstanding Balances Ledger'}
                            {activeTab === 7 && 'Customer Recovery Collection Statement'}
                            {activeTab === 8 && 'Corporate Voucher Audit Log Summary'}
                            {activeTab === 9 && 'Daily Cash & Bank Daybook Statement'}
                            {activeTab === 10 && 'Salesman Sales & Cash Collection Sheet'}
                            {activeTab === 11 && `General Trial Balance Audit Workbook${activeViewMode === 'detailed' ? ' (Detailed Sub-Ledger Breakdown)' : ' (Summary Statement)'}`}
                            {activeTab === 12 && 'Account Debit Aging Matrix Sheet'}
                            {activeTab === 13 && `Customer Account Balance & Outstanding Detail Report${activeViewMode === 'detailed' ? ' (Detailed Invoices)' : ' (Summary Balances)'}`}
                        </b></span>
                        <span>Duration Window Block: {activeTab === 11 ? `As of ${new Date().toISOString().split('T')[0]}` : `${filters.dateFrom || 'Initial'} up to ${filters.dateTo || 'Today'}`}</span>
                    </div>
                </div>

                {activeTab !== 4 && (
                    <ReportPagination
                        totalItems={filteredRows.length}
                        currentPage={currentPage}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setCurrentPage(1);
                        }}
                    />
                )}

                <div className="w-full overflow-x-auto">
                    {/* --- 📊 RENDER TABLE 1: CUSTOMER ACCOUNT LEDGER (CUSTOMER HEADER + ITEMIZED DETAILS) --- */}
                    {activeTab === 1 && (
                        <div className="space-y-6">
                            {paginatedRows.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 border border-black bg-gray-50 italic">
                                    No customer ledger records found for the selected date range.
                                </div>
                            ) : (
                                paginatedRows.map((cust, cIdx) => {
                                    const openBal = Number(cust.opening_balance || 0);
                                    const pDebit = Number(cust.period_debit || 0);
                                    const pCredit = Number(cust.period_credit || 0);
                                    const closeBal = Number(cust.closing_balance || 0);
                                    const txList = cust.transactions || [];

                                    return (
                                        <div key={cust.id || cIdx} className="border-2 border-black rounded bg-white overflow-hidden shadow-xs print:border-black print:break-inside-avoid">
                                            {/* Customer Header Banner */}
                                            <div className="bg-slate-100 p-3 border-b-2 border-black">
                                                <div className="flex flex-wrap justify-between items-center gap-2">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-mono font-bold bg-primary text-white px-2 py-0.5 rounded">
                                                                #{startIndex + cIdx + 1}
                                                            </span>
                                                            <h3 className="text-sm font-black uppercase text-slate-900 tracking-wide">
                                                                {cust.customer_name}
                                                            </h3>
                                                            {cust.customer_code && cust.customer_code !== '-' && (
                                                                <span className="text-xs font-mono bg-white border border-slate-300 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                                                                    {cust.customer_code}
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-bold uppercase">
                                                                {cust.category || 'Retail / General'}
                                                            </span>
                                                        </div>
                                                        <div className="text-[10px] text-slate-600 mt-1 font-mono flex gap-4">
                                                            <span>📞 Phone: <b className="text-slate-800">{cust.phone || '-'}</b></span>
                                                            {cust.address && cust.address !== '-' && (
                                                                <span>📍 Address: <b className="text-slate-800">{cust.address}</b></span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Customer Financial Quick Summary KPI */}
                                                    <div className="flex items-center gap-2 text-right">
                                                        <div className="bg-white border border-slate-300 rounded px-2.5 py-1 text-center font-mono">
                                                            <div className="text-[9px] font-bold text-slate-500 uppercase">Opening</div>
                                                            <div className="text-xs font-bold text-slate-800">
                                                                Rs. {openBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </div>
                                                        </div>
                                                        <div className="bg-white border border-slate-300 rounded px-2.5 py-1 text-center font-mono">
                                                            <div className="text-[9px] font-bold text-red-600 uppercase">Sales (Dr)</div>
                                                            <div className="text-xs font-black text-red-600">
                                                                Rs. {pDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </div>
                                                        </div>
                                                        <div className="bg-white border border-slate-300 rounded px-2.5 py-1 text-center font-mono">
                                                            <div className="text-[9px] font-bold text-emerald-700 uppercase">Paid/Recv (Cr)</div>
                                                            <div className="text-xs font-black text-emerald-700">
                                                                Rs. {pCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </div>
                                                        </div>
                                                        <div className={`border rounded px-3 py-1 text-center font-mono ${closeBal > 0.01 ? 'bg-red-50 border-red-300 text-red-700' : closeBal < -0.01 ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-300 text-slate-700'}`}>
                                                            <div className="text-[9px] font-bold uppercase">Net Closing</div>
                                                            <div className="text-xs font-black">
                                                                Rs. {closeBal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {closeBal > 0.01 ? '(Dr)' : closeBal < -0.01 ? '(Cr)' : ''}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Itemized Transactions Table for this Customer */}
                                            <table className="w-full table-auto border-collapse text-[11px] font-sans text-left">
                                                <thead className="bg-gray-50 border-b border-black font-mono text-[9.5px] uppercase font-bold text-slate-700">
                                                    <tr>
                                                        <th className="p-1.5 border-r border-black text-center w-8">#</th>
                                                        <th className="p-1.5 border-r border-black text-center w-24">Date</th>
                                                        <th className="p-1.5 border-r border-black w-28">Ref / Doc #</th>
                                                        <th className="p-1.5 border-r border-black w-36">Entry Type</th>
                                                        <th className="p-1.5 border-r border-black">Particulars / Narration</th>
                                                        <th className="p-1.5 border-r border-black text-right w-28 text-red-700">Debit (Sales)</th>
                                                        <th className="p-1.5 border-r border-black text-right w-28 text-emerald-700">Credit (Recv)</th>
                                                        <th className="p-1.5 text-right w-32 pr-3 text-slate-900">Running Balance</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {txList.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={8} className="p-4 text-center text-slate-400 italic">
                                                                No transactions logged for this customer within selected period.
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        txList.map((tx, tIdx) => (
                                                            <tr key={tIdx} className="border-b border-slate-200 hover:bg-slate-50/80 font-mono text-xs">
                                                                <td className="p-1.5 border-r border-slate-300 text-center text-slate-400">{tIdx + 1}</td>
                                                                <td className="p-1.5 border-r border-slate-300 text-center text-slate-600 font-bold">{tx.date}</td>
                                                                <td className="p-1.5 border-r border-slate-300 text-primary font-black uppercase">{tx.refNo}</td>
                                                                <td className="p-1.5 border-r border-slate-300 font-sans text-purple-700 font-bold text-[10px] uppercase">{tx.type}</td>
                                                                <td className="p-1.5 border-r border-slate-300 font-sans text-slate-700 truncate max-w-xs">{tx.notes}</td>
                                                                <td className="p-1.5 border-r border-slate-300 text-right font-black text-red-600">
                                                                    {Number(tx.debit) > 0 ? `Rs. ${Number(tx.debit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                                </td>
                                                                <td className="p-1.5 border-r border-slate-300 text-right font-black text-emerald-700">
                                                                    {Number(tx.credit) > 0 ? `Rs. ${Number(tx.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                                </td>
                                                                <td className={`p-1.5 text-right pr-3 font-black ${Number(tx.runningBalance) > 0.01 ? 'text-red-700' : Number(tx.runningBalance) < -0.01 ? 'text-emerald-700' : 'text-slate-700'}`}>
                                                                    Rs. {Number(tx.runningBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })} {Number(tx.runningBalance) > 0.01 ? 'Dr' : Number(tx.runningBalance) < -0.01 ? 'Cr' : ''}
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                                <tfoot className="bg-slate-100 font-mono font-bold text-xs border-t border-black">
                                                    <tr>
                                                        <td colSpan={5} className="p-1.5 border-r border-black text-right uppercase text-[10px] text-slate-700">
                                                            Customer Period Total:
                                                        </td>
                                                        <td className="p-1.5 border-r border-black text-right font-black text-red-700">
                                                            Rs. {pDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="p-1.5 border-r border-black text-right font-black text-emerald-700">
                                                            Rs. {pCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td className={`p-1.5 text-right pr-3 font-black text-xs ${closeBal > 0.01 ? 'text-red-700' : closeBal < -0.01 ? 'text-emerald-700' : 'text-slate-800'}`}>
                                                            Rs. {closeBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    );
                                })
                            )}

                            {/* Overall Grand Summary Footer across all customers */}
                            {reportRows.length > 0 && (
                                <div className="p-3 bg-slate-900 text-white rounded font-mono flex flex-wrap justify-between items-center text-xs print:border print:border-black print:bg-gray-100 print:text-black">
                                    <span className="font-bold uppercase tracking-wider">
                                        Grand Total ({reportRows.length} Customers):
                                    </span>
                                    <div className="flex gap-6 font-mono font-black text-sm">
                                        <span>Total Sales (Dr): <span className="text-rose-400 print:text-rose-700">Rs. {reportRows.reduce((s, r) => s + (Number(r.period_debit) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
                                        <span>Total Received (Cr): <span className="text-emerald-400 print:text-emerald-700">Rs. {reportRows.reduce((s, r) => s + (Number(r.period_credit) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
                                        <span>Net Outstanding: <span className="text-amber-300 print:text-slate-900 underline decoration-double">Rs. {reportRows.reduce((s, r) => s + (Number(r.closing_balance) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- 📊 RENDER TABLE 3: VENDOR BALANCE DETAIL REPORT (TAB 3) --- */}
                    {activeTab === 3 && (
                        <div>
                            <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                                <thead className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                                    <tr>
                                        <th className="p-1.5 border border-black text-center w-8">S#</th>
                                        <th className="p-1.5 border border-black">Vendor / Supplier Name</th>
                                        <th className="p-1.5 border border-black text-center w-32">Contact / Phone</th>
                                        <th className="p-1.5 border border-black text-right w-36">Opening Balance (PKR)</th>
                                        <th className="p-1.5 border border-black text-right w-36">Period Purchases (Cr)</th>
                                        <th className="p-1.5 border border-black text-right w-36">Period Payments (Dr)</th>
                                        <th className="p-1.5 border border-black text-right w-36">Net Closing Balance</th>
                                        <th className="p-1.5 border border-black text-center w-28">Account Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedRows.map((row, i) => {
                                        const openBal = Number(row.opening_balance || 0);
                                        const pCredit = Number(row.period_credit || 0);
                                        const pDebit = Number(row.period_debit || 0);
                                        const closeBal = Number(row.closing_balance || 0);
                                        const isExpanded = expandedCustomerIds.has(row.id);
                                        const hasTransactions = row.transactions && row.transactions.length > 0;

                                        return (
                                            <React.Fragment key={row.id || i}>
                                                <tr className={`border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs ${isExpanded ? 'bg-slate-50/70' : ''}`}>
                                                    <td className="p-1.5 border border-black text-center text-gray-400">{startIndex + i + 1}</td>
                                                    <td className="p-1.5 border border-black font-sans text-black font-bold">
                                                        <div>{row.vendor_name}</div>
                                                        {row.address && row.address !== '-' && (
                                                            <div className="text-[9px] text-gray-500 font-normal truncate max-w-xs">{row.address}</div>
                                                        )}
                                                    </td>
                                                    <td className="p-1.5 border border-black text-center text-gray-600 font-mono text-[10px]">{row.phone || '-'}</td>
                                                    <td className={`p-1.5 border border-black text-right font-mono ${openBal > 0.01 ? 'text-red-600 font-bold' : openBal < -0.01 ? 'text-emerald-700 font-bold' : 'text-gray-500'}`}>
                                                        Rs. {openBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="p-1.5 border border-black text-right text-red-600 font-bold font-mono">
                                                        Rs. {pCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="p-1.5 border border-black text-right text-emerald-700 font-bold font-mono">
                                                        Rs. {pDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className={`p-1.5 border border-black text-right font-mono text-xs ${closeBal > 0.01 ? 'text-red-700 font-black' : closeBal < -0.01 ? 'text-blue-700 font-black' : 'text-gray-600 font-bold'}`}>
                                                        <div>Rs. {closeBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                    </td>
                                                    <td className="p-1.5 border border-black text-center font-sans">
                                                        {closeBal > 0.01 ? (
                                                            <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-red-50 text-red-700 border border-red-200">
                                                                Payable (Cr)
                                                            </span>
                                                        ) : closeBal < -0.01 ? (
                                                            <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                Advance (Dr)
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
                                                                Settled (0.00)
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>

                                                {/* Expanded Transaction Details Sub-Table (Seamless Rows) */}
                                                {isExpanded && (
                                                    <tr className="bg-slate-50 border-b-2 border-black">
                                                        <td colSpan={8} className="p-0 border border-black">
                                                            <table className="w-full text-[10px] border-collapse font-sans bg-white">
                                                                <thead>
                                                                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 text-[9.5px] uppercase font-mono">
                                                                        <th className="p-1.5 pl-6 text-left w-28">Date</th>
                                                                        <th className="p-1.5 text-left w-36">Entry Type</th>
                                                                        <th className="p-1.5 text-left w-28 font-mono">Ref / Doc #</th>
                                                                        <th className="p-1.5 text-left">Description / Particulars</th>
                                                                        <th className="p-1.5 text-right w-36 text-red-700">Credit (Purchases)</th>
                                                                        <th className="p-1.5 text-right w-36 text-emerald-700">Debit (Payments)</th>
                                                                        <th className="p-1.5 pr-4 text-right w-36 font-mono">Running Balance</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {hasTransactions ? (
                                                                        row.transactions.map((tx: any, tIdx: number) => (
                                                                            <tr key={tIdx} className="border-b border-slate-200 hover:bg-slate-50 font-mono text-[10.5px]">
                                                                                <td className="p-1.5 pl-6 text-slate-600">
                                                                                    {tx.date && tx.date !== 'Opening' ? tx.date : 'Opening Bal'}
                                                                                </td>
                                                                                <td className="p-1.5 font-sans font-semibold text-slate-800">
                                                                                    {tx.type}
                                                                                </td>
                                                                                <td className="p-1.5 font-bold text-slate-900 font-mono">
                                                                                    {tx.refNo || '-'}
                                                                                </td>
                                                                                <td className="p-1.5 font-sans text-slate-600">
                                                                                    {tx.notes || '-'}
                                                                                </td>
                                                                                <td className="p-1.5 text-right font-bold text-red-600 font-mono">
                                                                                    {tx.credit > 0 ? `Rs. ${tx.credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                                                                </td>
                                                                                <td className="p-1.5 text-right font-bold text-emerald-600 font-mono">
                                                                                    {tx.debit > 0 ? `Rs. ${tx.debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                                                                </td>
                                                                                <td className={`p-1.5 pr-4 text-right font-bold font-mono ${tx.runningBalance > 0.01 ? 'text-red-700' : tx.runningBalance < -0.01 ? 'text-blue-700' : 'text-slate-600'}`}>
                                                                                    Rs. {tx.runningBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.runningBalance > 0.01 ? 'Cr' : tx.runningBalance < -0.01 ? 'Dr' : ''}
                                                                                </td>
                                                                            </tr>
                                                                        ))
                                                                    ) : (
                                                                        <tr>
                                                                            <td colSpan={7} className="py-2.5 text-center text-slate-400 font-sans text-[10.5px] italic">
                                                                                No purchase bills, payments, or returns found within this selected period.
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </tbody>
                                                            </table>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    {!isPrinting && pageSize !== 'all' && (
                                        <tr className="bg-amber-50/80 border-t border-amber-200 font-bold font-mono text-xs text-amber-950">
                                            <td colSpan={3} className="p-2 border border-black text-right uppercase tracking-wider">
                                                Page Subtotal (This Page):
                                            </td>
                                            <td className="p-2 border border-black text-right font-bold">
                                                Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.opening_balance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 border border-black text-right text-red-700 font-bold">
                                                Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.period_credit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 border border-black text-right text-emerald-700 font-bold">
                                                Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.period_debit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 border border-black text-right text-primary font-bold">
                                                Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.closing_balance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 border border-black text-center text-gray-500 text-[10px] font-sans uppercase">
                                                {paginatedRows.length} On Page
                                            </td>
                                        </tr>
                                    )}
                                    <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                                        <td colSpan={3} className="p-2 border border-black text-right uppercase tracking-wider text-black">
                                            Grand Totals Summary (All {reportRows.length} Records):
                                        </td>
                                        <td className="p-2 border border-black text-right text-black font-black text-xs">
                                            Rs. {reportRows.reduce((sum, r) => sum + Number(r.opening_balance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 border border-black text-right text-red-700 font-black text-xs">
                                            Rs. {reportRows.reduce((sum, r) => sum + Number(r.period_credit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 border border-black text-right text-emerald-700 font-black text-xs">
                                            Rs. {reportRows.reduce((sum, r) => sum + Number(r.period_debit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 border border-black text-right text-primary font-black underline decoration-double text-sm">
                                            Rs. {reportRows.reduce((sum, r) => sum + Number(r.closing_balance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 border border-black text-center text-gray-500 text-[10px] font-sans uppercase">
                                            {reportRows.length} Vendors
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {/* --- 📊 RENDER TABLE 2: MASTER CUSTOMER/VENDOR LEDGER TRANSACTIONS SUMMARIES (TABS 2, 6) --- */}
                    {(activeTab === 2 || activeTab === 6) && (
                        <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                            <thead className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                                <tr>
                                    <th className="p-1.5 border border-black text-center w-12">S#</th>
                                    <th className="p-1.5 border border-black text-center w-28">Date</th>
                                    <th className="p-1.5 border border-black w-36">Invoice / Ref No</th>
                                    <th className="p-1.5 border border-black">Associated Ledger Entity Title Account Name</th>
                                    <th className="p-1.5 border border-black text-center w-24">Payment Term</th>
                                    <th className="p-1.5 border border-black text-right pr-3 w-40">Gross Invoice Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedRows.map((row, i) => (
                                    <tr key={row.id || i} className="border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs">
                                        <td className="p-1.5 border border-black text-center text-gray-400">{startIndex + i + 1}</td>
                                        <td className="p-1.5 border border-black text-center text-gray-600 font-mono">
                                            {String(row.sale_date || row.created_at || '').split('T')[0]}
                                        </td>
                                        <td className="p-1.5 border border-black text-primary font-black uppercase">{row.purchase_no || row.id}</td>
                                        <td className="p-1.5 border border-black text-black font-sans font-bold">{row.customer_name || row.supplier_name || 'Generic Client Agent'}</td>
                                        <td className="p-1.5 border border-black text-center uppercase font-bold text-[10px]">{row.payment_term || 'Settle'}</td>
                                        <td className="p-1.5 border border-black text-right pr-3 text-success font-black">Rs. {Number(row.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                {!isPrinting && pageSize !== 'all' && (
                                    <tr className="bg-amber-50/80 border-t border-amber-200 font-bold font-mono text-xs text-amber-950">
                                        <td colSpan={5} className="p-2 border border-black text-right uppercase">Page Subtotal (This Page):</td>
                                        <td className="p-2 border border-black text-right pr-3 text-success font-black">
                                            Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                )}
                                <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                                    <td colSpan={5} className="p-2 border border-black text-right uppercase text-gray-800">Gross Account Aggregations (All {reportRows.length} Records):</td>
                                    <td className="p-2 border border-black text-right pr-3 text-success underline decoration-double text-sm font-black">
                                        Rs. {reportRows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    )}

                    {/* --- 📊 RENDER TABLE 2B: ACCOUNTS RECEIVABLE DEBIT AGING MATRIX SHEET (TAB 12) --- */}
                    {activeTab === 12 && (() => {
                        const totalDueSum = reportRows.reduce((sum, r) => sum + Number(r.total_due || 0), 0);
                        const total0_30Sum = reportRows.reduce((sum, r) => sum + Number(r.days_0_30 || 0), 0);
                        const total31_60Sum = reportRows.reduce((sum, r) => sum + Number(r.days_31_60 || 0), 0);
                        const total61_90Sum = reportRows.reduce((sum, r) => sum + Number(r.days_61_90 || 0), 0);
                        const total90PlusSum = reportRows.reduce((sum, r) => sum + Number(r.days_90_plus || 0), 0);

                        return (
                            <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                                <thead className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                                    <tr>
                                        <th className="p-1.5 border border-black text-center w-12">S#</th>
                                        <th className="p-1.5 border border-black">Customer / Account Title</th>
                                        <th className="p-1.5 border border-black text-center w-24">Unpaid Invoices</th>
                                        <th className="p-1.5 border border-black text-right w-32">Total Outstanding Debt</th>
                                        <th className="p-1.5 border border-black text-right w-28">0 - 30 Days (Current)</th>
                                        <th className="p-1.5 border border-black text-right w-28">31 - 60 Days</th>
                                        <th className="p-1.5 border border-black text-right w-28">61 - 90 Days</th>
                                        <th className="p-1.5 border border-black text-right w-28 pr-3">90+ Days Overdue</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedRows.map((row, i) => (
                                        <tr key={i} className="border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs text-black">
                                            <td className="p-1.5 border border-black text-center text-gray-400">{startIndex + i + 1}</td>
                                            <td className="p-1.5 border border-black font-sans uppercase font-bold text-black">{row.customer_name}</td>
                                            <td className="p-1.5 border border-black text-center font-bold text-gray-600">{row.invoice_count} Invoice(s)</td>
                                            <td className="p-1.5 border border-black text-right font-black text-danger">Rs. {Number(row.total_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td className="p-1.5 border border-black text-right text-success font-bold">{row.days_0_30 > 0 ? `Rs. ${Number(row.days_0_30).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</td>
                                            <td className="p-1.5 border border-black text-right text-yellow-600 font-bold">{row.days_31_60 > 0 ? `Rs. ${Number(row.days_31_60).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</td>
                                            <td className="p-1.5 border border-black text-right text-orange-600 font-bold">{row.days_61_90 > 0 ? `Rs. ${Number(row.days_61_90).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</td>
                                            <td className="p-1.5 border border-black text-right pr-3 text-red-600 font-black">{row.days_90_plus > 0 ? `Rs. ${Number(row.days_90_plus).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    {!isPrinting && pageSize !== 'all' && (
                                        <tr className="bg-amber-50/80 border-t border-amber-200 font-bold font-mono text-xs text-amber-950">
                                            <td colSpan={3} className="p-2 border border-black text-right uppercase tracking-wider">
                                                Page Subtotal (This Page):
                                            </td>
                                            <td className="p-2 border border-black text-right text-danger font-black text-xs">
                                                Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.total_due || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 border border-black text-right text-success font-black text-xs">
                                                Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.days_0_30 || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 border border-black text-right text-yellow-600 font-black text-xs">
                                                Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.days_31_60 || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 border border-black text-right text-orange-600 font-black text-xs">
                                                Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.days_61_90 || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 border border-black text-right pr-3 text-red-600 font-black text-xs">
                                                Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.days_90_plus || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    )}
                                    <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                                        <td colSpan={3} className="p-2 border border-black text-right uppercase tracking-wider text-black">
                                            Total Aggregated Aging Receivables (All {reportRows.length} Records):
                                        </td>
                                        <td className="p-2 border border-black text-right text-danger font-black underline decoration-double text-sm">
                                            Rs. {totalDueSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 border border-black text-right text-success font-black text-xs">
                                            Rs. {total0_30Sum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 border border-black text-right text-yellow-600 font-black text-xs">
                                            Rs. {total31_60Sum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 border border-black text-right text-orange-600 font-black text-xs">
                                            Rs. {total61_90Sum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 border border-black text-right pr-3 text-red-600 font-black text-xs">
                                            Rs. {total90PlusSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        );
                    })()}

                    {/* --- 📊 RENDER TABLE 4: OPERATIONAL EXPENSE AUDIT STATEMENT (TAB 4) --- */}
                    {activeTab === 4 && (() => {
                        const totalExpenseSum = reportRows.reduce((sum, r) => sum + Number(r.total_amount || r.debit || r.credit || 0), 0);
                        const totalCashExpense = reportRows
                            .filter(r => String(r.payment_mode || r.voucher_type || '').toLowerCase().includes('cash'))
                            .reduce((sum, r) => sum + Number(r.total_amount || r.debit || r.credit || 0), 0);
                        const totalBankExpense = reportRows
                            .filter(r => String(r.payment_mode || r.voucher_type || '').toLowerCase().includes('bank') || String(r.payment_mode || '').toLowerCase().includes('online'))
                            .reduce((sum, r) => sum + Number(r.total_amount || r.debit || r.credit || 0), 0);

                        return (
                            <div className="space-y-4">
                                {/* Visual KPI Summary Cards */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 print:hidden">
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">Total Operational Expenses</p>
                                        <p className="text-sm font-black text-rose-700 font-mono mt-0.5">
                                            Rs. {totalExpenseSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">Cash vs Bank Payments</p>
                                        <p className="text-[11px] font-black font-mono mt-0.5">
                                            <span className="text-emerald-700">Cash: Rs. {totalCashExpense.toLocaleString()}</span> / <span className="text-blue-700">Bank: Rs. {totalBankExpense.toLocaleString()}</span>
                                        </p>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">Total Expense Vouchers</p>
                                        <p className="text-sm font-black text-slate-900 font-mono mt-0.5">
                                            {reportRows.length} Vouchers
                                        </p>
                                    </div>
                                </div>

                                <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                                    <thead className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                                        <tr>
                                            <th className="p-1.5 border border-black text-center w-12">S#</th>
                                            <th className="p-1.5 border border-black text-center w-28">Processing Date</th>
                                            <th className="p-1.5 border border-black w-28">Voucher Ref #</th>
                                            <th className="p-1.5 border border-black">Expense Head / Title</th>
                                            <th className="p-1.5 border border-black">Paid To / Beneficiary</th>
                                            <th className="p-1.5 border border-black text-center w-24">Payment Mode</th>
                                            <th className="p-1.5 border border-black">Narration / Description</th>
                                            <th className="p-1.5 border border-black text-right w-32 pr-3">Amount (PKR)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="p-8 text-center text-gray-400 italic font-mono font-bold">
                                                    No operational expense records found matching the chosen date range.
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedRows.map((row, i) => {
                                                const dateDisplay = row.voucher_date || String(row.created_at || '').split('T')[0];
                                                const voucherRef = row.voucher_no || `EXP-${String(row.id).padStart(4, '0')}`;
                                                const expenseHead = row.account_name || (row.account_code ? `Account #${row.account_code}` : 'General Expense');
                                                const paidTo = row.party_name || row.customer_name || '-';
                                                const payMode = row.payment_mode || (String(row.voucher_type || '').includes('Bank') ? 'Bank' : 'Cash');
                                                const narration = row.narration || row.description || row.notes || '-';
                                                const amount = Number(row.total_amount || row.debit || row.credit || 0);

                                                return (
                                                    <tr key={row.id || i} className="border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs text-black">
                                                        <td className="p-1.5 border border-black text-center text-gray-400">{startIndex + i + 1}</td>
                                                        <td className="p-1.5 border border-black text-center text-gray-700">{dateDisplay}</td>
                                                        <td className="p-1.5 border border-black font-bold uppercase text-primary whitespace-nowrap">{voucherRef}</td>
                                                        <td className="p-1.5 border border-black font-sans uppercase font-bold text-slate-900">{expenseHead}</td>
                                                        <td className="p-1.5 border border-black font-sans text-gray-800">{paidTo}</td>
                                                        <td className="p-1.5 border border-black text-center font-sans">
                                                            <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase ${
                                                                payMode.toLowerCase() === 'cash' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                                                            }`}>
                                                                {payMode}
                                                            </span>
                                                        </td>
                                                        <td className="p-1.5 border border-black font-sans text-gray-600 text-[10.5px]">{narration}</td>
                                                        <td className="p-1.5 border border-black text-right pr-3 font-mono font-black text-rose-700 whitespace-nowrap">
                                                            Rs. {amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                    <tfoot>
                                        {!isPrinting && pageSize !== 'all' && (
                                            <tr className="bg-amber-50 border-t border-black font-bold font-mono text-xs text-amber-950">
                                                <td colSpan={7} className="p-2 border border-black text-right uppercase tracking-wider text-amber-900">
                                                    Page {currentPage} Subtotal ({paginatedRows.length} vouchers):
                                                </td>
                                                <td className="p-2 border border-black text-right pr-3 text-rose-700 font-black whitespace-nowrap">
                                                    Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.total_amount || r.debit || r.credit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        )}
                                        <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                                            <td colSpan={7} className="p-2 border border-black text-right uppercase tracking-wider text-gray-900">
                                                Grand Total Operational Expenditures (All {reportRows.length} Vouchers):
                                            </td>
                                            <td className="p-2 border border-black text-right pr-3 text-rose-700 underline decoration-double text-sm whitespace-nowrap font-black">
                                                Rs. {totalExpenseSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        );
                    })()}

                    {activeTab === 5 && (
                        <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                            <thead className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                                <tr>
                                    <th className="p-1.5 border border-black text-center w-12">Index</th>
                                    <th className="p-1.5 border border-black w-28">Category Code</th>
                                    <th className="p-1.5 border border-black w-28">Control Code</th>
                                    <th className="p-1.5 border border-black w-32">Account Code</th>
                                    <th className="p-1.5 border border-black">Chart Account Ledger Title Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedRows.map((row, i) => (
                                    <tr key={row.id || i} className="border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs text-black">
                                        <td className="p-1.5 border border-black text-center text-gray-400">{startIndex + i + 1}</td>
                                        <td className="p-1.5 border border-black uppercase text-gray-500">{row.category_code}</td>
                                        <td className="p-1.5 border border-black font-sans uppercase font-bold">{row.account_title}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* --- 📊 RENDER TABLE 5B: GAAP DOUBLE-ENTRY TRIAL BALANCE AUDIT WORKBOOK (TAB 11) --- */}
                    {activeTab === 11 && (() => {
                        const totalDebitSum = filteredRows.reduce((sum, r) => sum + Number(r.debit || 0), 0);
                        const totalCreditSum = filteredRows.reduce((sum, r) => sum + Number(r.credit || 0), 0);
                        const isBalanced = Math.abs(totalDebitSum - totalCreditSum) < 1;

                        const accountGroups = [
                            { 
                                key: 'ASSETS', 
                                label: '1000 • ASSETS & RESOURCE RESERVES', 
                                match: (c: string, code: string) => c.includes('ASSET') || code.startsWith('1') 
                            },
                            { 
                                key: 'LIABILITIES', 
                                label: '2000 • LIABILITIES & EXTERNAL OBLIGATIONS', 
                                match: (c: string, code: string) => c.includes('LIABILIT') || code.startsWith('2') 
                            },
                            { 
                                key: 'EQUITY', 
                                label: '3000 • EQUITY & RETAINED EARNINGS', 
                                match: (c: string, code: string) => c.includes('EQUITY') || code.startsWith('3') 
                            },
                            { 
                                key: 'REVENUE', 
                                label: '4000 • REVENUE & OPERATING SALES INFLOWS', 
                                match: (c: string, code: string) => c.includes('REVENUE') || code.startsWith('4') 
                            },
                            { 
                                key: 'EXPENSES', 
                                label: '5000 • EXPENSES & OPERATIONAL OUTFLOWS', 
                                match: (c: string, code: string) => c.includes('EXPENSE') || code.startsWith('5') 
                            },
                        ];

                        let overallIndex = 0;

                        return (
                            <div className="space-y-4">
                                <div className="flex justify-end items-center mb-2 print-hidden-element print:hidden">
                                    <button
                                        type="button"
                                        onClick={toggleAllCustomerDetails}
                                        className="text-[10.5px] font-bold px-2.5 py-1.5 rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center gap-1 shadow-2xs transition cursor-pointer"
                                    >
                                        {activeViewMode === 'detailed' ? (
                                            <><MdUnfoldLess size={14} className="text-slate-600" /> Collapse All Details</>
                                        ) : (
                                            <><MdUnfoldMore size={14} className="text-emerald-700" /> Expand All Details</>
                                        )}
                                    </button>
                                </div>

                                <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                                    <thead className="bg-gray-100 border-b-2 border-black font-black uppercase text-black font-mono text-[10px]">
                                        <tr>
                                            <th className="p-1.5 border border-black text-center w-12">S#</th>
                                            <th className="p-1.5 border border-black text-center w-24">Account Code</th>
                                            <th className="p-1.5 border border-black">Account Head / Sub-Ledger Description</th>
                                            <th className="p-1.5 border border-black text-center w-40">Reference / Classification</th>
                                            <th className="p-1.5 border border-black text-right w-40">Debit Balance (PKR)</th>
                                            <th className="p-1.5 border border-black text-right w-40">Credit Balance (PKR)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {accountGroups.map((grp) => {
                                            const groupRows = filteredRows.filter(r => grp.match(String(r.category || '').toUpperCase(), String(r.code || '')));
                                            if (groupRows.length === 0) return null;

                                            const groupDebit = groupRows.reduce((s, r) => s + Number(r.debit || 0), 0);
                                            const groupCredit = groupRows.reduce((s, r) => s + Number(r.credit || 0), 0);

                                            return (
                                                <React.Fragment key={grp.key}>
                                                    {/* 🏛️ Head Category Header Banner */}
                                                    <tr className="bg-slate-800 text-white font-black font-mono text-xs border-y-2 border-black tracking-wider uppercase">
                                                        <td colSpan={6} className="p-2 pl-3 bg-slate-800 text-white">
                                                            <div className="flex justify-between items-center">
                                                                <span className="font-extrabold tracking-wider">{grp.label}</span>
                                                                <span className="text-[10px] text-slate-300 font-sans font-normal">
                                                                    {groupRows.length} Account Head(s)
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>

                                                    {/* Account Sub-Headers and Itemized Details */}
                                                    {groupRows.map((row) => {
                                                        overallIndex += 1;
                                                        const isExpanded = activeViewMode === 'detailed' || expandedCustomerIds.has(row.id || row.code);
                                                        const hasDetails = row.details && row.details.length > 0;

                                                        return (
                                                            <React.Fragment key={row.code || row.id}>
                                                                {/* Account Sub Header Row */}
                                                                <tr className={`border-b border-black font-semibold font-mono text-xs ${isExpanded ? 'bg-slate-100/90 font-bold' : 'bg-white hover:bg-slate-50'}`}>
                                                                    <td className="p-1.5 border border-black text-center text-gray-500 font-bold">{overallIndex}</td>
                                                                    <td className="p-1.5 border border-black text-center font-bold text-primary">{row.code}</td>
                                                                    <td className="p-1.5 border border-black font-sans uppercase font-bold text-slate-900" colSpan={2}>
                                                                        {row.title}
                                                                    </td>
                                                                    <td className="p-1.5 border border-black text-right font-black text-slate-900">
                                                                        {row.debit > 0 ? `Rs. ${Number(row.debit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                                                                    </td>
                                                                    <td className="p-1.5 border border-black text-right font-black text-slate-900">
                                                                        {row.credit > 0 ? `Rs. ${Number(row.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                                                                    </td>
                                                                </tr>

                                                                {/* Itemized Sub-Ledger Details (when expanded / detailed view) */}
                                                                {isExpanded && hasDetails && row.details.map((dt: any, dIdx: number) => (
                                                                    <tr key={dIdx} className="bg-slate-50/70 border-b border-slate-200 hover:bg-slate-100/80 font-mono text-[11px]">
                                                                        <td className="p-1.5 border border-black text-center text-gray-400 text-[10px]">{overallIndex}.{dIdx + 1}</td>
                                                                        <td className="p-1.5 border border-black text-center text-slate-400 text-[10px]">{row.code}</td>
                                                                        <td className="p-1.5 border border-black font-sans text-slate-800 font-medium pl-6">
                                                                            <span className="text-slate-400 mr-2 font-mono">↳</span>
                                                                            <span>{dt.name}</span>
                                                                        </td>
                                                                        <td className="p-1.5 border border-black text-center text-slate-500 text-[10px] font-sans">
                                                                            {dt.ref || '-'}
                                                                        </td>
                                                                        <td className="p-1.5 border border-black text-right text-slate-700 font-semibold text-[11px]">
                                                                            {dt.debit > 0 ? `Rs. ${Number(dt.debit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                                                                        </td>
                                                                        <td className="p-1.5 border border-black text-right text-slate-700 font-semibold text-[11px]">
                                                                            {dt.credit > 0 ? `Rs. ${Number(dt.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </React.Fragment>
                                                        );
                                                    })}

                                                    {/* Category Subtotal Row */}
                                                    <tr className="bg-slate-100 border-b-2 border-black font-bold font-mono text-xs text-slate-900">
                                                        <td colSpan={4} className="p-2 border border-black text-right uppercase tracking-wider">
                                                            Subtotal — {grp.label.includes('•') ? grp.label.split('•')[1] : grp.label}:
                                                        </td>
                                                        <td className="p-2 border border-black text-right font-black text-slate-900">
                                                            Rs. {groupDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="p-2 border border-black text-right font-black text-slate-900">
                                                            Rs. {groupCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                                            <td colSpan={4} className="p-2 border border-black text-right uppercase tracking-wider text-black">
                                                Aggregated Trial Balance Audit Sum (All {filteredRows.length} Records):
                                            </td>
                                            <td className="p-2 border border-black text-right text-black font-black underline decoration-double text-sm">
                                                Rs. {totalDebitSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 border border-black text-right pr-3 text-black font-black underline decoration-double text-sm">
                                                Rs. {totalCreditSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colSpan={6} className={`p-2 border border-black text-center font-black uppercase text-xs ${isBalanced ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                                                Trial Balance Verification: {isBalanced ? 'STATEMENT EQUATION BALANCED (DEBIT = CREDIT) ✅' : 'DISCREPANCY DETECTED IN DOUBLE ENTRY LEDGER ⚠️'}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        );
                    })()}

                    {/* --- 📊 RENDER TABLE 6: CUSTOMER RECOVERY COLLECTION STATEMENT (TAB 7) --- */}
                    {activeTab === 7 && (
                        <div className="max-w-full overflow-x-auto mt-4">
                            <table className="w-full table-auto border-collapse border border-black text-left text-[11px]">
                                <thead>
                                    <tr className="bg-gray-100 font-bold uppercase tracking-wider text-black border-b border-black font-mono text-[10px]">
                                        <th className="p-2 border border-black text-center w-12">S#</th>
                                        <th className="p-2 border border-black text-center w-28">Voucher No</th>
                                        <th className="p-2 border border-black text-center w-24">Recovery Date</th>
                                        <th className="p-2 border border-black">Customer Account Name</th>
                                        <th className="p-2 border border-black">Original Invoice Ref</th>
                                        <th className="p-2 border border-black">Narration / Notes</th>
                                        <th className="p-2 border border-black text-right w-36 pr-3">Recovered Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-8 text-gray-400 font-medium italic">
                                                No customer cash recovery collections logged within chosen selection parameters.
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedRows.map((row, idx) => (
                                            <tr key={row.id || idx} className="hover:bg-slate-50 border-b border-gray-300 font-medium text-black">
                                                <td className="p-1.5 border border-black text-center font-mono">{startIndex + idx + 1}</td>
                                                <td className="p-1.5 border border-black text-center font-bold text-primary tracking-wide font-mono uppercase">
                                                    {row.voucher_no}
                                                </td>
                                                <td className="p-1.5 border border-black text-center text-gray-600 font-mono">
                                                    {String(row.voucher_date || '').split('T')[0]}
                                                </td>
                                                <td className="p-1.5 border border-black font-bold uppercase">
                                                    {row.customer_name || row.customerName || 'Walking Client'}
                                                </td>
                                                <td className="p-1.5 border border-black font-mono text-center text-gray-600">
                                                    {row.original_invoice_no || '-'}
                                                </td>
                                                <td className="p-1.5 border border-black text-gray-500 italic text-[10px]">
                                                    {row.narration || row.notes || 'Recovery Logged'}
                                                </td>
                                                <td className="p-1.5 border border-black text-right font-black font-mono pr-3 text-success">
                                                    Rs. {Number(row.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                {reportRows.length > 0 && (
                                    <tfoot>
                                        {!isPrinting && pageSize !== 'all' && (
                                            <tr className="bg-amber-50/80 border-t border-amber-200 font-bold font-mono text-xs text-amber-950">
                                                <td colSpan={6} className="p-2 border border-black text-right uppercase text-[10px]">
                                                    Page Subtotal (This Page):
                                                </td>
                                                <td className="p-2 border border-black text-right pr-3 text-success text-xs font-black">
                                                    Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        )}
                                        <tr className="bg-gray-100 font-black border-t-2 border-black text-black font-mono">
                                            <td colSpan={6} className="p-2 border border-black text-right uppercase text-[10px]">
                                                Total Cash Receipts Collected (All {reportRows.length} Records):
                                            </td>
                                            <td className="p-2 border border-black text-right pr-3 text-success text-xs underline decoration-double">
                                                Rs. {reportRows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    )}

                    {/* --- 📊 RENDER TABLE 4A: UNIFIED VOUCHERS JOURNAL SUMMARY (TAB 8) --- */}
                    {activeTab === 8 && (
                        <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                            <thead className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                                <tr>
                                    <th className="p-1.5 border border-black text-center w-12">S#</th>
                                    <th className="p-1.5 border border-black text-center w-28">Voucher Date</th>
                                    <th className="p-1.5 border border-black w-32">Voucher / Ref No</th>
                                    <th className="p-1.5 border border-black w-36">Voucher Type</th>
                                    <th className="p-1.5 border border-black">Beneficiary / Particulars / Remarks</th>
                                    <th className="p-1.5 border border-black text-right pr-3 w-36">Voucher Amount (PKR)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedRows.map((row, i) => {
                                    const displayVoucherNo = row.voucher_no || row.voucherNo || row.purchase_no || `VCH-00${row.id}`;
                                    const displayVoucherType = row.voucher_type || row.voucherType || filters.saleType || 'Voucher Entry';
                                    const displayDate = row.voucher_date || row.voucherDate || row.processing_date || row.sale_date || String(row.created_at || '').split('T')[0];
                                    const displayAmount = row.total_amount || row.amount_paid || row.net_collected_amount || row.amountReceived || row.amount || 0;
                                    const displayRemarks = row.narration || row.notes || row.remarks || row.scenario_type || 'System verified log';

                                    return (
                                        <tr key={row.id || i} className="border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs">
                                            <td className="p-1.5 border border-black text-center text-gray-400">{startIndex + i + 1}</td>
                                            <td className="p-1.5 border border-black text-center text-gray-500">{displayDate}</td>
                                            <td className="p-1.5 border border-black text-primary font-black uppercase">{displayVoucherNo}</td>
                                            <td className="p-1.5 border border-black font-sans text-purple-700 font-bold uppercase">{displayVoucherType}</td>
                                            <td className="p-1.5 border border-black font-sans text-gray-600 truncate max-w-xs">{displayRemarks}</td>
                                            <td className="p-1.5 border border-black text-right pr-3 text-success font-black">Rs. {Number(displayAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                {!isPrinting && pageSize !== 'all' && (
                                    <tr className="bg-amber-50/80 border-t border-amber-200 font-bold font-mono text-xs text-amber-950">
                                        <td colSpan={5} className="p-2 border border-black text-right uppercase">Page Subtotal (This Page):</td>
                                        <td className="p-2 border border-black text-right pr-3 text-success font-black">
                                            Rs. {paginatedRows.reduce((sum, r) => {
                                                const amt = r.total_amount || r.amount_paid || r.net_collected_amount || r.amountReceived || r.amount || 0;
                                                return sum + Number(amt);
                                            }, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                )}
                                <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                                    <td colSpan={5} className="p-2 border border-black text-right uppercase text-gray-800">Gross Transacted Total (All {reportRows.length} Records):</td>
                                    <td className="p-2 border border-black text-right pr-3 text-success underline decoration-double text-sm font-black">
                                        Rs. {reportRows.reduce((sum, r) => {
                                            const amt = r.total_amount || r.amount_paid || r.net_collected_amount || r.amountReceived || r.amount || 0;
                                            return sum + Number(amt);
                                        }, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    )}

                    {/* --- 📊 RENDER TABLE 4B: DAILY CASH & BANK DAYBOOK (TAB 9) --- */}
                    {activeTab === 9 && (
                        <div className="space-y-4">
                            {/* Daybook KPI Summary Bar */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 print:grid-cols-4">
                                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded print:border-black">
                                    <div className="text-[10px] uppercase font-bold text-emerald-800">Total Cash In / Receipts</div>
                                    <div className="text-base font-black text-emerald-700 font-mono">
                                        Rs. {reportRows.reduce((s, r) => s + (Number(r.cash_in) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                                <div className="p-3 bg-rose-50 border border-rose-300 rounded print:border-black">
                                    <div className="text-[10px] uppercase font-bold text-rose-800">Total Cash Out / Payments</div>
                                    <div className="text-base font-black text-rose-700 font-mono">
                                        Rs. {reportRows.reduce((s, r) => s + (Number(r.cash_out) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                                <div className="p-3 bg-blue-50 border border-blue-300 rounded print:border-black">
                                    <div className="text-[10px] uppercase font-bold text-blue-800">Net Flow (Period)</div>
                                    <div className={`text-base font-black font-mono ${(reportRows.reduce((s, r) => s + (Number(r.cash_in) || 0) - (Number(r.cash_out) || 0), 0)) >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                                        Rs. {reportRows.reduce((s, r) => s + (Number(r.cash_in) || 0) - (Number(r.cash_out) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                                <div className="p-3 bg-slate-50 border border-slate-300 rounded print:border-black">
                                    <div className="text-[10px] uppercase font-bold text-slate-800">Closing Cash / Bank Balance</div>
                                    <div className="text-base font-black text-slate-900 font-mono">
                                        Rs. {(reportRows.length > 0 ? reportRows[reportRows.length - 1].balance : 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>

                            <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                                <thead className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                                    <tr>
                                        <th className="p-1.5 border border-black text-center w-10">S#</th>
                                        <th className="p-1.5 border border-black text-center w-24">Date</th>
                                        <th className="p-1.5 border border-black w-28">Invoice No</th>
                                        <th className="p-1.5 border border-black w-28">Transaction Type</th>
                                        <th className="p-1.5 border border-black">Party / Account Title</th>
                                        <th className="p-1.5 border border-black text-center w-16">Mode</th>
                                        <th className="p-1.5 border border-black">Narration / Description</th>
                                        <th className="p-1.5 border border-black text-right w-28 text-emerald-700">Cash IN (PKR)</th>
                                        <th className="p-1.5 border border-black text-right w-28 text-rose-700">Cash OUT (PKR)</th>
                                        <th className="p-1.5 border border-black text-right w-28 pr-3 text-slate-900">Balance (PKR)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} className="p-8 text-center text-gray-400 italic">No cash or bank transactions found for the selected date range.</td>
                                        </tr>
                                    ) : (
                                        paginatedRows.map((row, i) => (
                                            <tr key={i} className={`border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs ${row.is_bf ? 'bg-amber-50/70 font-bold' : ''}`}>
                                                <td className="p-1.5 border border-black text-center text-gray-400">{row.is_bf ? 'B/F' : startIndex + i + 1}</td>
                                                <td className="p-1.5 border border-black text-center text-gray-600">{row.date}</td>
                                                <td className="p-1.5 border border-black text-primary font-black uppercase">
                                                    {row.is_bf ? (
                                                        <span className="bg-amber-200 text-amber-950 text-[9px] px-1.5 py-0.5 rounded font-black border border-amber-400">B/F</span>
                                                    ) : (
                                                        row.doc_no
                                                    )}
                                                </td>
                                                <td className="p-1.5 border border-black font-sans font-bold text-[10px] uppercase text-purple-700">
                                                    {row.is_bf ? (
                                                        <span className="text-amber-900 font-black">OPENING BALANCE</span>
                                                    ) : (
                                                        row.type
                                                    )}
                                                </td>
                                                <td className="p-1.5 border border-black font-sans font-bold text-gray-900">{row.party}</td>
                                                <td className="p-1.5 border border-black text-center font-sans font-bold text-gray-600 text-[10px] uppercase">{row.payment_mode}</td>
                                                <td className="p-1.5 border border-black font-sans text-gray-600 truncate max-w-xs text-[10px]">{row.narration}</td>
                                                <td className="p-1.5 border border-black text-right font-black text-emerald-700">
                                                    {Number(row.cash_in) > 0 ? `Rs. ${Number(row.cash_in).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                </td>
                                                <td className="p-1.5 border border-black text-right font-black text-rose-700">
                                                    {Number(row.cash_out) > 0 ? `Rs. ${Number(row.cash_out).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                </td>
                                                <td className={`p-1.5 border border-black text-right pr-3 font-black ${Number(row.balance) >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>
                                                    Rs. {Number(row.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                <tfoot>
                                    {!isPrinting && pageSize !== 'all' && (
                                        <tr className="bg-amber-50/80 border-t border-amber-200 font-bold font-mono text-xs text-amber-950">
                                            <td colSpan={7} className="p-2 border border-black text-right uppercase">Page Subtotal:</td>
                                            <td className="p-2 border border-black text-right font-black text-emerald-700">
                                                Rs. {paginatedRows.reduce((s, r) => s + (Number(r.cash_in) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 border border-black text-right font-black text-rose-700">
                                                Rs. {paginatedRows.reduce((s, r) => s + (Number(r.cash_out) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 border border-black text-right pr-3 font-black text-slate-900">
                                                Rs. {(paginatedRows.length > 0 ? paginatedRows[paginatedRows.length - 1].balance : 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    )}
                                    <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                                        <td colSpan={7} className="p-2 border border-black text-right uppercase text-gray-800">Grand Total ({reportRows.length} Transactions):</td>
                                        <td className="p-2 border border-black text-right text-emerald-700 underline decoration-double font-black">
                                            Rs. {reportRows.reduce((s, r) => s + (Number(r.cash_in) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 border border-black text-right text-rose-700 underline decoration-double font-black">
                                            Rs. {reportRows.reduce((s, r) => s + (Number(r.cash_out) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 border border-black text-right pr-3 text-slate-900 underline decoration-double font-black">
                                            Rs. {(reportRows.length > 0 ? reportRows[reportRows.length - 1].balance : 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {/* --- 📊 RENDER TABLE 5: SALESMAN SALES & CASH COLLECTION SHEET (TAB 10) --- */}
                    {activeTab === 10 && (
                        <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                            <thead className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                                <tr>
                                    <th className="p-1.5 border border-black text-center w-12">S#</th>
                                    <th className="p-1.5 border border-black text-center w-28">Date</th>
                                    <th className="p-1.5 border border-black w-32">Invoice / Ref No</th>
                                    <th className="p-1.5 border border-black w-36">Entry Classification</th>
                                    <th className="p-1.5 border border-black w-32">Sales Officer</th>
                                    <th className="p-1.5 border border-black">Customer / Account Title</th>
                                    <th className="p-1.5 border border-black text-right w-32">Sales Invoice (PKR)</th>
                                    <th className="p-1.5 border border-black text-right w-32 pr-3">Cash Collected (PKR)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedRows.map((row, i) => (
                                    <tr key={row.id || i} className="border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs">
                                        <td className="p-1.5 border border-black text-center text-gray-400">{startIndex + i + 1}</td>
                                        <td className="p-1.5 border border-black text-center text-gray-500">{row.raw_date}</td>
                                        <td className="p-1.5 border border-black text-primary font-black uppercase">{row.doc_ref}</td>
                                        <td className="p-1.5 border border-black text-purple-700 font-bold uppercase text-[10px]">{row.entry_type}</td>
                                        <td className="p-1.5 border border-black font-sans text-black font-bold">{row.salesman}</td>
                                        <td className="p-1.5 border border-black font-sans text-gray-700">{row.customer_name}</td>
                                        <td className="p-1.5 border border-black text-right text-black font-bold">Rs. {Number(row.sale_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="p-1.5 border border-black text-right pr-3 text-success font-black">Rs. {Number(row.collected_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                {!isPrinting && pageSize !== 'all' && (
                                    <tr className="bg-amber-50/80 border-t border-amber-200 font-bold font-mono text-xs text-amber-950">
                                        <td colSpan={6} className="p-2 border border-black text-right uppercase tracking-wider">
                                            Page Subtotal (This Page):
                                        </td>
                                        <td className="p-2 border border-black text-right text-black font-bold">
                                            Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.sale_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 border border-black text-right pr-3 text-success font-black">
                                            Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.collected_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                )}
                                <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                                    <td colSpan={6} className="p-2 border border-black text-right uppercase tracking-wider text-black">
                                        Total Performance Aggregations (All {reportRows.length} Records):
                                    </td>
                                    <td className="p-2 border border-black text-right text-black font-black text-sm">
                                        Rs. {reportRows.reduce((sum, r) => sum + Number(r.sale_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="p-2 border border-black text-right pr-3 text-success font-black underline decoration-double text-sm">
                                        Rs. {reportRows.reduce((sum, r) => sum + Number(r.collected_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    )}

                    {/* --- 📊 RENDER TABLE 13: CUSTOMER BALANCE DETAIL REPORT (TAB 13) --- */}
                    {activeTab === 13 && (
                        <div>
                            <div className="flex justify-between items-center mb-2 print-hidden-element print:hidden">
                                <span className="text-xs text-slate-500 font-medium">
                                    Click <span className="font-bold text-slate-700">"Details"</span> or <span className="font-bold text-slate-700">"Expand All"</span> to inspect individual invoices, receipts, and returns per customer.
                                </span>
                                <button
                                    type="button"
                                    onClick={toggleAllCustomerDetails}
                                    className="text-[10.5px] font-bold px-2.5 py-1 rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center gap-1 shadow-2xs transition cursor-pointer"
                                >
                                    {expandedCustomerIds.size > 0 ? (
                                        <><MdUnfoldLess size={14} className="text-slate-600" /> Collapse All Details</>
                                    ) : (
                                        <><MdUnfoldMore size={14} className="text-emerald-700" /> Expand All Details</>
                                    )}
                                </button>
                            </div>

                            <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                                <thead className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                                    <tr>
                                        <th className="p-1.5 border border-black text-center w-8">S#</th>
                                        <th className="p-1.5 border border-black text-center w-24">Cust Code</th>
                                        <th className="p-1.5 border border-black">Customer / Business Name</th>
                                        <th className="p-1.5 border border-black text-center w-32">Customer Category</th>
                                        <th className="p-1.5 border border-black text-center w-28">Contact / Phone</th>
                                        <th className="p-1.5 border border-black text-right w-32">Opening Balance (PKR)</th>
                                        <th className="p-1.5 border border-black text-right w-32">Period Debit / Sales (PKR)</th>
                                        <th className="p-1.5 border border-black text-right w-32">Period Credit / Receipts (PKR)</th>
                                        <th className="p-1.5 border border-black text-right w-36">Net Closing Balance (PKR)</th>
                                        <th className="p-1.5 border border-black text-center w-28">Account Status</th>
                                        <th className="p-1.5 border border-black text-center w-16 print-hidden-element print:hidden">Detail</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedRows.map((row, i) => {
                                        const openBal = Number(row.opening_balance || 0);
                                        const pDebit = Number(row.period_debit || 0);
                                        const pCredit = Number(row.period_credit || 0);
                                        const closeBal = Number(row.closing_balance || 0);
                                        const isExpanded = expandedCustomerIds.has(row.id);
                                        const hasTransactions = row.transactions && row.transactions.length > 0;

                                        return (
                                            <React.Fragment key={row.id || i}>
                                                <tr className={`border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs ${isExpanded ? 'bg-slate-50/70' : ''}`}>
                                                    <td className="p-1.5 border border-black text-center text-gray-400">{startIndex + i + 1}</td>
                                                    <td className="p-1.5 border border-black text-center font-mono">
                                                        {row.customer_code && row.customer_code !== '-' ? (
                                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                                                {row.customer_code}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-400 text-[10px]">-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-1.5 border border-black font-sans text-black font-bold">
                                                        <div>{row.customer_name}</div>
                                                        {row.address && row.address !== '-' && (
                                                            <div className="text-[9px] text-gray-500 font-normal truncate max-w-xs">{row.address}</div>
                                                        )}
                                                    </td>
                                                    <td className="p-1.5 border border-black text-center font-sans">
                                                        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                                            {row.category || 'Retail / General'}
                                                        </span>
                                                    </td>
                                                    <td className="p-1.5 border border-black text-center text-gray-600 font-mono text-[10px]">{row.phone || '-'}</td>
                                                    <td className={`p-1.5 border border-black text-right font-mono ${openBal > 0.01 ? 'text-red-600 font-bold' : openBal < -0.01 ? 'text-emerald-700 font-bold' : 'text-gray-500'}`}>
                                                        Rs. {openBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="p-1.5 border border-black text-right text-red-600 font-bold font-mono">
                                                        Rs. {pDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="p-1.5 border border-black text-right text-emerald-700 font-bold font-mono">
                                                        Rs. {pCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className={`p-1.5 border border-black text-right font-mono text-xs ${closeBal > 0.01 ? 'text-red-700 font-black' : closeBal < -0.01 ? 'text-blue-700 font-black' : 'text-gray-600 font-bold'}`}>
                                                        <div>Rs. {closeBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                        {row.balance_reasons && row.balance_reasons.length > 0 && (
                                                            <div className="text-[8.5px] font-sans font-normal text-slate-500 mt-0.5 max-w-[210px] ml-auto leading-tight">
                                                                {row.balance_reasons.slice(0, 2).join(' • ')}
                                                                {row.balance_reasons.length > 2 && ` (+${row.balance_reasons.length - 2} more)`}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-1.5 border border-black text-center font-sans">
                                                        {closeBal > 0.01 ? (
                                                            <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-red-50 text-red-700 border border-red-200">
                                                                Debit Due (Dr)
                                                            </span>
                                                        ) : closeBal < -0.01 ? (
                                                            <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                Credit Adv (Cr)
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
                                                                Settled (0.00)
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-1.5 border border-black text-center print-hidden-element print:hidden font-sans">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleCustomerExpanded(row.id)}
                                                            className={`p-1 rounded text-[10px] font-bold flex items-center justify-center mx-auto transition cursor-pointer ${
                                                                isExpanded
                                                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                                                            }`}
                                                            title={isExpanded ? 'Collapse transaction details' : 'Expand transaction details'}
                                                        >
                                                            {isExpanded ? <MdExpandMore size={14} /> : <MdChevronRight size={14} />}
                                                        </button>
                                                    </td>
                                                </tr>

                                                {/* Expanded Transaction Details Sub-Table */}
                                                {isExpanded && (
                                                    <tr className="bg-slate-50/90 border-b-2 border-black">
                                                        <td colSpan={11} className="p-3 pl-8 pr-4 border border-black bg-slate-50/70">
                                                            <div className="bg-white rounded-lg border border-slate-300 p-3 shadow-2xs space-y-2">
                                                                <div className="text-[10px] font-black uppercase tracking-wider text-slate-800 pb-1.5 border-b border-slate-200 flex justify-between items-center">
                                                                    <span>Itemized Period Audit for {row.customer_name} {row.customer_code ? `(${row.customer_code})` : ''}</span>
                                                                    <span className="text-slate-500 font-mono font-normal">
                                                                        {hasTransactions ? `${row.transactions.length} Total Records` : 'No Transactions In Period'}
                                                                    </span>
                                                                </div>

                                                                {hasTransactions ? (
                                                                    <table className="w-full text-[10px] border-collapse font-sans">
                                                                        <thead>
                                                                            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 text-[9.5px] uppercase font-mono">
                                                                                <th className="p-1 text-left w-24">Date</th>
                                                                                <th className="p-1 text-left w-36">Entry Type</th>
                                                                                <th className="p-1 text-left w-32">Invoice No</th>
                                                                                <th className="p-1 text-left">Description / Particulars</th>
                                                                                <th className="p-1 text-right w-28 text-red-700">Debit (Sales)</th>
                                                                                <th className="p-1 text-right w-28 text-emerald-700">Credit (Receipts)</th>
                                                                                <th className="p-1 text-right w-32">Running Balance</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {row.transactions.map((tx: any, tIdx: number) => (
                                                                                <tr key={tIdx} className="border-b border-slate-200 hover:bg-slate-50 font-mono text-[10px]">
                                                                                    <td className="p-1 text-slate-600">
                                                                                        {tx.date && tx.date !== 'Opening' ? tx.date : 'Opening Bal'}
                                                                                    </td>
                                                                                    <td className="p-1 font-sans font-semibold text-slate-800">
                                                                                        {tx.type}
                                                                                    </td>
                                                                                    <td className="p-1 font-bold text-slate-900">
                                                                                        {tx.refNo}
                                                                                    </td>
                                                                                    <td className="p-1 font-sans text-slate-600">
                                                                                        {tx.notes}
                                                                                    </td>
                                                                                    <td className="p-1 text-right font-bold text-red-600">
                                                                                        {tx.debit > 0 ? `Rs. ${tx.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                                                    </td>
                                                                                    <td className="p-1 text-right font-bold text-emerald-600">
                                                                                        {tx.credit > 0 ? `Rs. ${tx.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                                                    </td>
                                                                                    <td className={`p-1 text-right font-bold ${tx.runningBalance > 0.01 ? 'text-red-700' : tx.runningBalance < -0.01 ? 'text-blue-700' : 'text-slate-600'}`}>
                                                                                        Rs. {tx.runningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {tx.runningBalance > 0.01 ? 'Dr' : tx.runningBalance < -0.01 ? 'Cr' : ''}
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                ) : (
                                                                    <div className="py-2 text-center text-slate-400 font-sans text-[10.5px]">
                                                                        No invoices, receipts, or returns found within this selected period.
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    {!isPrinting && pageSize !== 'all' && (
                                        <tr className="bg-amber-50/80 border-t border-amber-200 font-bold font-mono text-xs text-amber-950">
                                            <td colSpan={5} className="p-2 border border-black text-right uppercase tracking-wider">
                                                Page Subtotal (This Page):
                                            </td>
                                            <td className="p-2 border border-black text-right font-bold">
                                                Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.opening_balance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 border border-black text-right text-red-700 font-bold">
                                                Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.period_debit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 border border-black text-right text-emerald-700 font-bold">
                                                Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.period_credit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 border border-black text-right text-primary font-bold">
                                                Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.closing_balance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td colSpan={2} className="p-2 border border-black text-center text-gray-500 text-[10px] font-sans uppercase">
                                                {paginatedRows.length} On Page
                                            </td>
                                        </tr>
                                    )}
                                    <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                                        <td colSpan={5} className="p-2 border border-black text-right uppercase tracking-wider text-black">
                                            Grand Totals Summary (All {reportRows.length} Records):
                                        </td>
                                        <td className="p-2 border border-black text-right text-black font-black text-xs">
                                            Rs. {reportRows.reduce((sum, r) => sum + Number(r.opening_balance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 border border-black text-right text-red-700 font-black text-xs">
                                            Rs. {reportRows.reduce((sum, r) => sum + Number(r.period_debit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 border border-black text-right text-emerald-700 font-black text-xs">
                                            Rs. {reportRows.reduce((sum, r) => sum + Number(r.period_credit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 border border-black text-right text-primary font-black underline decoration-double text-sm">
                                            Rs. {reportRows.reduce((sum, r) => sum + Number(r.closing_balance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td colSpan={2} className="p-2 border border-black text-center text-gray-500 text-[10px] font-sans uppercase">
                                            {reportRows.length} Accounts
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {reportRows.length === 0 && (
                        <div className="p-12 text-center border font-bold italic text-gray-400 bg-gray-50/50 rounded-sm">No structural financial transaction records discovered matching chosen selection tokens.</div>
                    )}
                </div>

                {activeTab !== 4 && (
                    <ReportPagination
                        totalItems={filteredRows.length}
                        currentPage={currentPage}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setCurrentPage(1);
                        }}
                    />
                )}

                {/* ✍️ Formal Multi-Level Executive Verification & Signature Block */}
                <div className="mt-16 grid grid-cols-3 gap-10 text-center text-[10px] font-sans font-black uppercase tracking-wider text-slate-800 break-inside-avoid">
                    <div className="flex flex-col justify-end">
                        <div className="signature-spacer h-20 min-h-[80px]" style={{ height: '80px', minHeight: '80px' }}></div>
                        <div className="border-t-2 border-black pt-2">
                            <div className="text-black font-extrabold text-[10px]">PREPARED BY</div>
                            <div className="text-[8.5px] font-semibold text-gray-500 normal-case">Lead Accounts &amp; Financial Controller</div>
                        </div>
                    </div>

                    <div className="flex flex-col justify-end">
                        <div className="signature-spacer h-20 min-h-[80px]" style={{ height: '80px', minHeight: '80px' }}></div>
                        <div className="border-t-2 border-black pt-2">
                            <div className="text-black font-extrabold text-[10px]">VERIFIED BY</div>
                            <div className="text-[8.5px] font-semibold text-gray-500 normal-case">Chief Internal Auditor &amp; Compliance Lead</div>
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

export default AccountReportPrint;
