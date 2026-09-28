import React from 'react';
import { MdFirstPage, MdLastPage, MdChevronLeft, MdChevronRight } from 'react-icons/md';

interface ReportPaginationProps {
  currentPage: number;
  totalItems?: number;
  totalCount?: number;
  pageSize: number | string;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
}

export const ReportPagination: React.FC<ReportPaginationProps> = ({
  currentPage,
  totalItems,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [15, 25, 50, 100],
  itemLabel = 'records'
}) => {
  const actualTotal = Number(totalItems !== undefined ? totalItems : (totalCount !== undefined ? totalCount : 0));
  if (actualTotal === 0) return null;

  const numericPageSize = pageSize === 'all' || pageSize === 'All' ? actualTotal : (Number(pageSize) || 25);
  const totalPages = Math.max(1, Math.ceil(actualTotal / numericPageSize));
  const validCurrentPage = Math.min(Math.max(1, Number(currentPage) || 1), totalPages);
  const startIdx = (validCurrentPage - 1) * numericPageSize + 1;
  const endIdx = Math.min(validCurrentPage * numericPageSize, actualTotal);

  // Generate visible page numbers (max 5 around current page)
  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 dark:bg-boxdark p-3 rounded-lg border border-stroke dark:border-strokedark text-xs print:hidden print-hidden-element select-none">
      {/* Records count display */}
      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 font-mono text-[11px]">
        <span>
          Showing <b className="text-black dark:text-white">{startIdx}</b> to <b className="text-black dark:text-white">{endIdx}</b> of <b className="text-emerald-600 dark:text-emerald-400 font-bold">{totalItems}</b> {itemLabel}
        </span>
        <span className="text-gray-400">•</span>
        <span>
          Page <b className="text-black dark:text-white">{currentPage}</b> of <b className="text-black dark:text-white">{totalPages}</b>
        </span>
      </div>

      {/* Page controls & Page size selector */}
      <div className="flex items-center gap-3 flex-wrap justify-end">
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
            <span>Per Page:</span>
            <select
              value={pageSize >= 10000 ? 'All' : pageSize}
              onChange={(e) => {
                const val = e.target.value === 'All' ? 10000 : Number(e.target.value);
                onPageSizeChange(val);
                onPageChange(1);
              }}
              className="border border-stroke dark:border-strokedark rounded px-2 py-1 bg-white dark:bg-boxdark text-black dark:text-white font-bold text-xs outline-none cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              <option value="All">All ({totalItems})</option>
            </select>
          </div>
        )}

        <div className="flex items-center gap-1">
          {/* First page */}
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(1)}
            title="First Page"
            className="p-1.5 rounded border border-stroke dark:border-strokedark bg-white dark:bg-boxdark hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-gray-700 dark:text-gray-200"
          >
            <MdFirstPage size={16} />
          </button>

          {/* Previous page */}
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            title="Previous Page"
            className="p-1.5 rounded border border-stroke dark:border-strokedark bg-white dark:bg-boxdark hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-gray-700 dark:text-gray-200"
          >
            <MdChevronLeft size={16} />
          </button>

          {/* Page numbers */}
          {getPageNumbers().map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => onPageChange(num)}
              className={`min-w-[28px] h-7 px-2 rounded text-xs font-bold transition cursor-pointer ${
                currentPage === num
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-white dark:bg-boxdark border border-stroke dark:border-strokedark text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              {num}
            </button>
          ))}

          {/* Next page */}
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            title="Next Page"
            className="p-1.5 rounded border border-stroke dark:border-strokedark bg-white dark:bg-boxdark hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-gray-700 dark:text-gray-200"
          >
            <MdChevronRight size={16} />
          </button>

          {/* Last page */}
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(totalPages)}
            title="Last Page"
            className="p-1.5 rounded border border-stroke dark:border-strokedark bg-white dark:bg-boxdark hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-gray-700 dark:text-gray-200"
          >
            <MdLastPage size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportPagination;
