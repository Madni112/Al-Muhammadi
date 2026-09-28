import XLSX from 'xlsx-js-style';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  type?: 'text' | 'number' | 'currency' | 'date' | 'percent';
  alignment?: 'left' | 'center' | 'right' | { horizontal?: 'left' | 'center' | 'right'; vertical?: string };
  numFmt?: string;
}

export interface ExcelExportConfig {
  fileName: string;
  sheetName?: string;
  companyName?: string;
  reportTitle: string;
  filterSummary?: Record<string, string | number | boolean | undefined | null>;
  columns: ExcelColumn[];
  data: any[];
  summaryRow?: Record<string, any> | boolean;
  theme?: 'navy' | 'emerald' | 'purple' | 'slate';
}

export interface MultiSheetExcelConfig {
  fileName: string;
  companyName?: string;
  reportTitle?: string;
  sheets: {
    sheetName: string;
    reportTitle: string;
    filterSummary?: Record<string, string | number | boolean | undefined | null>;
    columns: ExcelColumn[];
    data: any[];
    summaryRow?: Record<string, any> | boolean;
    theme?: 'navy' | 'emerald' | 'purple' | 'slate';
  }[];
}

const THEMES = {
  emerald: {
    primary: '064E3B',    // Deep Emerald Pine
    secondary: '059669',  // Software Theme Primary Emerald (#059669)
    headerText: 'FFFFFF',
    subHeaderText: 'FFFFFF',
    zebra: 'F0FDF4',     // Ultra light mint zebra (#F0FDF4)
    totalBg: 'D1FAE5',    // Mint Total Accent (#D1FAE5)
    totalText: '064E3B',
    borderColor: 'CBD5E1'
  },
  navy: {
    primary: '1E3A8A',    // Royal Navy Blue
    secondary: '2563EB',  // Vibrant Blue
    headerText: 'FFFFFF',
    subHeaderText: 'FFFFFF',
    zebra: 'F8FAFC',     // Light slate
    totalBg: 'E2E8F0',    // Soft Slate Total
    totalText: '0F172A',
    borderColor: 'CBD5E1'
  },
  purple: {
    primary: '4C1D95',    // Deep Purple
    secondary: '7C3AED',  // Vibrant Purple
    headerText: 'FFFFFF',
    subHeaderText: 'FFFFFF',
    zebra: 'FAF5FF',     // Light purple
    totalBg: 'EDE9FE',    // Lavender Total
    totalText: '3B0764',
    borderColor: 'DDD6FE'
  },
  slate: {
    primary: '1E293B',    // Slate Dark
    secondary: '475569',  // Slate Medium
    headerText: 'FFFFFF',
    subHeaderText: 'FFFFFF',
    zebra: 'F8FAFC',
    totalBg: 'E2E8F0',
    totalText: '0F172A',
    borderColor: 'CBD5E1'
  }
};

/**
 * Creates a beautifully styled and formatted Excel Worksheet
 */
const createStyledWorksheet = (config: any): XLSX.WorkSheet => {
  const companyName = String(config.companyName || config.title || 'ZOAIB ALI & COMPANY');
  const reportTitle = String(config.reportTitle || config.subtitle || 'FINANCIAL AUDIT REPORT');
  const {
    filterSummary,
    columns = [],
    data = [],
    summaryRow = true,
    theme = 'emerald'
  } = config;

  const activeTheme = THEMES[theme] || THEMES.emerald;
  const numCols = Math.max(columns.length, 4);
  const endColLetter = XLSX.utils.encode_col(Math.max(0, columns.length - 1));

  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const rowHeights: { hpt: number }[] = [];

  let currentRow = 0;

  // Thin border definition for standard cells
  const standardBorder = {
    top: { style: 'thin', color: { rgb: activeTheme.borderColor } },
    bottom: { style: 'thin', color: { rgb: activeTheme.borderColor } },
    left: { style: 'thin', color: { rgb: activeTheme.borderColor } },
    right: { style: 'thin', color: { rgb: activeTheme.borderColor } }
  };

  // Header border definition
  const headerBorder = {
    top: { style: 'medium', color: { rgb: '0F172A' } },
    bottom: { style: 'medium', color: { rgb: '0F172A' } },
    left: { style: 'thin', color: { rgb: activeTheme.borderColor } },
    right: { style: 'thin', color: { rgb: activeTheme.borderColor } }
  };

  // Total border definition (Accounting Double Underline)
  const totalBorder = {
    top: { style: 'thin', color: { rgb: '0F172A' } },
    bottom: { style: 'double', color: { rgb: '0F172A' } },
    left: { style: 'thin', color: { rgb: activeTheme.borderColor } },
    right: { style: 'thin', color: { rgb: activeTheme.borderColor } }
  };

  // ==========================================
  // ROW 1: COMPANY BANNER
  // ==========================================
  const compRef = `A${currentRow + 1}`;
  ws[compRef] = {
    v: companyName.toUpperCase(),
    t: 's',
    s: {
      font: { name: 'Calibri', sz: 16, bold: true, color: { rgb: activeTheme.headerText } },
      fill: { fgColor: { rgb: activeTheme.primary } },
      alignment: { horizontal: 'center', vertical: 'center' }
    }
  };
  // Fill other cells in merge range so background & borders render properly
  for (let c = 1; c < columns.length; c++) {
    const ref = `${XLSX.utils.encode_col(c)}${currentRow + 1}`;
    ws[ref] = { v: '', t: 's', s: { fill: { fgColor: { rgb: activeTheme.primary } } } };
  }
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: Math.max(0, columns.length - 1) } });
  rowHeights.push({ hpt: 32 });
  currentRow++;

  // ==========================================
  // ROW 2: REPORT TITLE BANNER
  // ==========================================
  const titleRef = `A${currentRow + 1}`;
  ws[titleRef] = {
    v: reportTitle.toUpperCase(),
    t: 's',
    s: {
      font: { name: 'Calibri', sz: 12, bold: true, color: { rgb: activeTheme.subHeaderText } },
      fill: { fgColor: { rgb: activeTheme.secondary } },
      alignment: { horizontal: 'center', vertical: 'center' }
    }
  };
  for (let c = 1; c < columns.length; c++) {
    const ref = `${XLSX.utils.encode_col(c)}${currentRow + 1}`;
    ws[ref] = { v: '', t: 's', s: { fill: { fgColor: { rgb: activeTheme.secondary } } } };
  }
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: Math.max(0, columns.length - 1) } });
  rowHeights.push({ hpt: 24 });
  currentRow++;

  // ==========================================
  // ROW 3: GENERATION TIMESTAMP & METADATA
  // ==========================================
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const metaRef = `A${currentRow + 1}`;
  ws[metaRef] = {
    v: `Generated on: ${dateStr} at ${timeStr}  |  Official ERP Financial & Audit Statement`,
    t: 's',
    s: {
      font: { name: 'Calibri', sz: 9, italic: true, color: { rgb: '475569' } },
      fill: { fgColor: { rgb: 'F1F5F9' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: standardBorder
    }
  };
  for (let c = 1; c < columns.length; c++) {
    const ref = `${XLSX.utils.encode_col(c)}${currentRow + 1}`;
    ws[ref] = { v: '', t: 's', s: { fill: { fgColor: { rgb: 'F1F5F9' } }, border: standardBorder } };
  }
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: columns.length - 1 } });
  rowHeights.push({ hpt: 18 });
  currentRow++;

  // ==========================================
  // ROW 4: APPLIED FILTERS (IF APPLICABLE)
  // ==========================================
  if (filterSummary && Object.keys(filterSummary).length > 0) {
    const filterText = Object.entries(filterSummary)
      .filter(([_, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join('   |   ');

    if (filterText) {
      const filterRef = `A${currentRow + 1}`;
      ws[filterRef] = {
        v: `Filters Applied: ${filterText}`,
        t: 's',
        s: {
          font: { name: 'Calibri', sz: 9, bold: true, color: { rgb: '334155' } },
          fill: { fgColor: { rgb: 'F8FAFC' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: standardBorder
        }
      };
      for (let c = 1; c < columns.length; c++) {
        const ref = `${XLSX.utils.encode_col(c)}${currentRow + 1}`;
        ws[ref] = { v: '', t: 's', s: { fill: { fgColor: { rgb: 'F8FAFC' } }, border: standardBorder } };
      }
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: columns.length - 1 } });
      rowHeights.push({ hpt: 18 });
      currentRow++;
    }
  }

  // Blank spacing row
  rowHeights.push({ hpt: 8 });
  currentRow++;

  // ==========================================
  // ROW 5: TABLE COLUMN HEADERS
  // ==========================================
  // Helper to extract alignment string safely (handles both string and { horizontal: 'right' })
  const getAlignment = (colAlign: any, defaultAlign: 'left' | 'center' | 'right'): 'left' | 'center' | 'right' => {
    if (typeof colAlign === 'string') return colAlign as 'left' | 'center' | 'right';
    if (colAlign && typeof colAlign === 'object' && colAlign.horizontal) return colAlign.horizontal;
    return defaultAlign;
  };

  // Helper to check if a column represents currency or general numbers
  const isCurrencyColumn = (col: any) => {
    if (col.type === 'currency') return true;
    if (col.type === 'number' || col.type === 'text' || col.type === 'date') return false;
    const key = String(col.key || '').toLowerCase();
    const hdr = String(col.header || '').toLowerCase();
    return key.includes('amount') || key.includes('sales') || key.includes('revenue') || key.includes('spend') ||
      key.includes('valuation') || key.includes('debit') || key.includes('credit') || key.includes('rate') ||
      key.includes('price') || hdr.includes('(pkr)') || hdr.includes('(rs.)');
  };

  const isNumberColumn = (col: any) => {
    if (col.type === 'number') return true;
    if (col.type === 'currency' || col.type === 'text' || col.type === 'date') return false;
    const key = String(col.key || '').toLowerCase();
    const hdr = String(col.header || '').toLowerCase();
    return key.includes('qty') || key.includes('units') || key.includes('count') || key.includes('stock') ||
      hdr.includes('qty') || hdr.includes('units');
  };

  // Header row
  const headerRowIdx = currentRow;
  columns.forEach((col: any, colIdx: number) => {
    const cellRef = `${XLSX.utils.encode_col(colIdx)}${headerRowIdx + 1}`;
    const defaultAlign = (isCurrencyColumn(col) || isNumberColumn(col)) ? 'right' : (col.type === 'date' ? 'center' : 'left');
    const align = getAlignment(col.alignment, defaultAlign);

    ws[cellRef] = {
      v: col.header,
      t: 's',
      s: {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: activeTheme.headerText } },
        fill: { fgColor: { rgb: activeTheme.primary } },
        alignment: { horizontal: align, vertical: 'center', wrapText: true },
        border: headerBorder
      }
    };
  });
  rowHeights.push({ hpt: 26 });
  currentRow++;

  // ==========================================
  // DATA ROWS WITH ZEBRA STRIPING & BORDERS
  // ==========================================
  data.forEach((item, rowIdx) => {
    const isZebra = rowIdx % 2 === 1;
    const rowBg = isZebra ? activeTheme.zebra : 'FFFFFF';

    // Special Handling: Grouped Header Banner Row
    if (item._isHeader || item._isSubHeader || item._isSectionHeader) {
      const isSub = Boolean(item._isSubHeader || item._isSectionHeader);
      const bannerText = item._bannerText || item.header || '';
      const isReturnSection = bannerText.toUpperCase().includes('RETURN');

      const bgColor = isSub
        ? (isReturnSection ? 'FFE4E6' : 'F0FDF4')
        : 'E2E8F0';
      const textColor = isSub
        ? (isReturnSection ? '881337' : '064E3B')
        : '0F172A';
      const fontSize = isSub ? 11 : 13;

      const cellRef = `A${currentRow + 1}`;
      ws[cellRef] = {
        v: bannerText,
        t: 's',
        s: {
          font: { name: 'Calibri', sz: fontSize, bold: true, color: { rgb: textColor } },
          fill: { fgColor: { rgb: bgColor } },
          alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
          border: {
            top: { style: isSub ? 'thin' : 'medium', color: { rgb: textColor } },
            bottom: { style: 'thin', color: { rgb: textColor } },
            left: { style: isSub ? 'thin' : 'medium', color: { rgb: textColor } },
            right: { style: isSub ? 'thin' : 'medium', color: { rgb: textColor } }
          }
        }
      };

      for (let c = 1; c < columns.length; c++) {
        const ref = `${XLSX.utils.encode_col(c)}${currentRow + 1}`;
        ws[ref] = {
          v: '',
          t: 's',
          s: {
            fill: { fgColor: { rgb: bgColor } },
            border: {
              top: { style: isSub ? 'thin' : 'medium', color: { rgb: textColor } },
              bottom: { style: 'thin', color: { rgb: textColor } },
              left: { style: 'thin', color: { rgb: 'CBD5E1' } },
              right: { style: isSub ? 'thin' : 'medium', color: { rgb: textColor } }
            }
          }
        };
      }

      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: Math.max(0, columns.length - 1) } });
      rowHeights.push({ hpt: isSub ? 24 : 30 });
      currentRow++;
      return;
    }

    // Special Handling: Subtotal Row per Group
    if (item._isSubtotal) {
      columns.forEach((col: any, colIdx: number) => {
        const cellRef = `${XLSX.utils.encode_col(colIdx)}${currentRow + 1}`;
        const rawVal = item[col.key];
        const isNum = typeof rawVal === 'number';
        const defaultAlign = (isCurrencyColumn(col) || isNumberColumn(col) || isNum) ? 'right' : 'left';
        const align = getAlignment(col.alignment, defaultAlign);

        ws[cellRef] = {
          v: rawVal !== undefined && rawVal !== null ? rawVal : '',
          t: isNum ? 'n' : 's',
          s: {
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '0F172A' } },
            fill: { fgColor: { rgb: 'F1F5F9' } },
            alignment: { horizontal: align, vertical: 'center' },
            border: {
              top: { style: 'thin', color: { rgb: '0F172A' } },
              bottom: { style: 'medium', color: { rgb: '0F172A' } },
              left: { style: 'thin', color: { rgb: 'CBD5E1' } },
              right: { style: 'thin', color: { rgb: 'CBD5E1' } }
            },
            ...(isNum ? { numFmt: col.numFmt || '#,##0.00' } : {})
          }
        };
      });

      rowHeights.push({ hpt: 22 });
      currentRow++;
      return;
    }

    columns.forEach((col: any, colIdx: number) => {
      const cellRef = `${XLSX.utils.encode_col(colIdx)}${currentRow + 1}`;
      const rawVal = item[col.key];
      const isCur = isCurrencyColumn(col);
      const isNum = isNumberColumn(col);
      const defaultAlign = (isCur || isNum) ? 'right' : (col.type === 'date' ? 'center' : 'left');
      const align = getAlignment(col.alignment, defaultAlign);

      let cellValue: any = rawVal;
      let cellType = 's';
      let numFmt: string | undefined = col.numFmt;

      if (isCur) {
        const num = Number(rawVal || 0);
        cellValue = isNaN(num) ? 0 : num;
        cellType = 'n';
        numFmt = col.numFmt || '#,##0.00';
      } else if (isNum) {
        const num = Number(rawVal || 0);
        cellValue = isNaN(num) ? 0 : num;
        cellType = 'n';
        numFmt = col.numFmt || (num % 1 !== 0 ? '#,##0.00' : '#,##0.00');
      } else if (col.type === 'date') {
        cellValue = rawVal ? String(rawVal).split('T')[0] : '-';
        cellType = 's';
      } else if (col.type === 'percent') {
        const num = Number(rawVal || 0);
        cellValue = isNaN(num) ? 0 : num;
        cellType = 'n';
        numFmt = col.numFmt || '0.00%';
      } else {
        if (typeof rawVal === 'number') {
          cellValue = rawVal;
          cellType = 'n';
          numFmt = col.numFmt || (rawVal % 1 !== 0 ? '#,##0.00' : '#,##0');
        } else {
          cellValue = rawVal !== undefined && rawVal !== null ? String(rawVal) : '-';
          cellType = 's';
        }
      }

      ws[cellRef] = {
        v: cellValue,
        t: cellType,
        s: {
          font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' } },
          fill: { fgColor: { rgb: rowBg } },
          alignment: { horizontal: align, vertical: 'center' },
          border: standardBorder,
          ...(numFmt ? { numFmt } : {})
        }
      };
    });

    rowHeights.push({ hpt: 20 });
    currentRow++;
  });

  // ==========================================
  // TOTAL / SUMMARY ROW (IF APPLICABLE)
  // ==========================================
  const shouldRenderSummary = summaryRow !== false && data.length > 0;
  if (shouldRenderSummary) {
    const summaryData: Record<string, any> = typeof summaryRow === 'object' && summaryRow !== null ? summaryRow : {};
    const validDataRows = data.filter(row => !row._isHeader && !row._isSubHeader && !row._isSectionHeader && !row._isSubtotal);

    // Calculate sum for currency and number columns if not provided
    columns.forEach((col: any) => {
      const isCur = isCurrencyColumn(col);
      const isNum = isNumberColumn(col);
      if (summaryData[col.key] === undefined && (isCur || isNum)) {
        const sum = validDataRows.reduce((acc, row) => acc + (Number(row[col.key]) || 0), 0);
        summaryData[col.key] = sum;
      }
    });

    columns.forEach((col: any, colIdx: number) => {
      const cellRef = `${XLSX.utils.encode_col(colIdx)}${currentRow + 1}`;
      const isFirstCol = colIdx === 0;
      const isCur = isCurrencyColumn(col);
      const isNum = isNumberColumn(col);
      const defaultAlign = (isCur || isNum) ? 'right' : 'left';
      const align = getAlignment(col.alignment, defaultAlign);

      let val = summaryData[col.key];
      let cellType = 's';
      let numFmt: string | undefined = col.numFmt;

      if (isFirstCol && !val) {
        val = 'SUMMARY';
      }

      if (isCur && typeof val === 'number') {
        cellType = 'n';
        numFmt = col.numFmt || '#,##0.00';
      } else if (isNum && typeof val === 'number') {
        cellType = 'n';
        numFmt = col.numFmt || '#,##0.00';
      } else if (typeof val === 'number') {
        cellType = 'n';
        numFmt = col.numFmt || '#,##0.00';
      } else {
        val = val !== undefined && val !== null ? String(val) : '';
      }

      ws[cellRef] = {
        v: val,
        t: cellType,
        s: {
          font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: activeTheme.totalText } },
          fill: { fgColor: { rgb: activeTheme.totalBg } },
          alignment: { horizontal: align, vertical: 'center' },
          border: totalBorder,
          ...(numFmt ? { numFmt } : {})
        }
      };
    });

    rowHeights.push({ hpt: 24 });
    currentRow++;
  }

  // ==========================================
  // COLUMN WIDTHS AUTO-CALCULATION
  // ==========================================
  const colWidths = columns.map((col) => {
    if (col.width) return { wch: col.width };
    const maxDataLen = data.reduce((max, row) => {
      const valStr = String(row[col.key] || '');
      return Math.max(max, valStr.length);
    }, col.header.length);
    return { wch: Math.max(maxDataLen + 4, 12) };
  });

  // Assign metadata to worksheet
  ws['!ref'] = `A1:${endColLetter}${currentRow}`;
  ws['!merges'] = merges;
  ws['!cols'] = colWidths;
  ws['!rows'] = rowHeights;

  return ws;
};

/**
 * Exports a single sheet styled Excel document with corporate branding
 */
export const exportToExcel = async (config: any) => {
  const ws = createStyledWorksheet(config);
  const wb = XLSX.utils.book_new();
  const sheetName = config.sheetName || 'Report Summary';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const fileTarget = String(config.fileName || config.filename || 'Report_Export');
  XLSX.writeFile(wb, fileTarget.endsWith('.xlsx') ? fileTarget : `${fileTarget}.xlsx`);
};

/**
 * Exports a multi-sheet corporate financial workbook with styling
 */
export const exportMultiSheetExcel = async (config: MultiSheetExcelConfig) => {
  const wb = XLSX.utils.book_new();

  config.sheets.forEach((sheetCfg) => {
    const ws = createStyledWorksheet({
      companyName: config.companyName,
      reportTitle: sheetCfg.reportTitle,
      filterSummary: sheetCfg.filterSummary,
      columns: sheetCfg.columns,
      data: sheetCfg.data,
      summaryRow: sheetCfg.summaryRow,
      theme: sheetCfg.theme || 'emerald'
    });

    XLSX.utils.book_append_sheet(wb, ws, sheetCfg.sheetName);
  });

  XLSX.writeFile(wb, config.fileName.endsWith('.xlsx') ? config.fileName : `${config.fileName}.xlsx`);
};
