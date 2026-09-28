import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MdSearch, MdClose } from 'react-icons/md';

interface SearchableMultiSelectProps {
  label?: string;
  options: string[];
  value: string[];
  onChange: (val: string[]) => void;
  placeholder: string;
  className?: string;
  allLabel?: string;
  disabled?: boolean;
}

export const SearchableMultiSelect: React.FC<SearchableMultiSelectProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder,
  className = '',
  allLabel,
  disabled = false
}) => {
  const safeValue = Array.isArray(value) ? value : (typeof value === 'string' && value !== 'All' ? [value] : []);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(o => String(o || '').toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, isOpen]);

  const defaultAllText = allLabel || (
    placeholder.toLowerCase().startsWith('all ')
      ? placeholder
      : `All ${placeholder.endsWith('y') ? placeholder.slice(0, -1) + 'ies' : placeholder.endsWith('s') ? placeholder : placeholder + 's'}`
  );
  
  // First item in the list is always "Select All / Clear All"
  const totalCount = filtered.length + 1;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || disabled) {
      if (!disabled && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % totalCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + totalCount) % totalCount);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex === 0) {
        onChange([]);
      } else {
        const selectedOpt = filtered[highlightedIndex - 1];
        if (selectedOpt) toggleOption(selectedOpt);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const toggleOption = (opt: string) => {
    if (safeValue.includes(opt)) {
      onChange(safeValue.filter(v => v !== opt));
    } else {
      onChange([...safeValue, opt]);
    }
  };

  const removePill = (e: React.MouseEvent, opt: string) => {
    e.stopPropagation();
    if (!disabled) {
      onChange(safeValue.filter(v => v !== opt));
    }
  };

  return (
    <div className={`relative ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`} ref={containerRef} onKeyDown={handleKeyDown}>
      {label && <label className="block font-bold text-gray-500 dark:text-slate-400 text-[11px] mb-1">{label}</label>}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        tabIndex={disabled ? -1 : 0}
        className={`w-full rounded-lg border border-stroke dark:border-strokedark bg-transparent p-1.5 min-h-[34px] flex flex-wrap gap-1 items-center transition outline-none ${disabled ? 'bg-slate-50 dark:bg-slate-800' : 'cursor-pointer hover:border-primary focus:border-primary'}`}
      >
        {safeValue.length === 0 ? (
          <span className="text-xs font-semibold px-2 text-black dark:text-white select-none opacity-80">{defaultAllText}</span>
        ) : (
          safeValue.map(v => (
            <div key={v} className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-bold border border-primary/20">
              <span className="truncate max-w-[100px]" title={v}>{v}</span>
              <button
                type="button"
                onClick={(e) => removePill(e, v)}
                className="hover:bg-primary/20 rounded-full p-0.5 transition"
              >
                <MdClose size={10} />
              </button>
            </div>
          ))
        )}
      </div>

      {isOpen && !disabled && (
        <div className="absolute left-0 top-full mt-1.5 z-[999999] w-full min-w-[220px] bg-white dark:bg-[#1A222C] border border-stroke dark:border-strokedark rounded-xl shadow-2xl p-2 space-y-1">
          <div className="relative mb-1">
            <MdSearch size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${placeholder.replace(/^all\s+/i, '')}...`}
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-stroke dark:border-strokedark bg-slate-50 dark:bg-slate-900 text-xs font-bold outline-none text-black dark:text-white"
            />
          </div>

          <div ref={listRef} className="max-h-48 overflow-y-auto divide-y divide-stroke dark:divide-strokedark">
            <div
              onClick={() => { onChange([]); setQuery(''); }}
              className={`p-2 rounded-lg cursor-pointer text-xs flex justify-between items-center transition ${
                highlightedIndex === 0 || safeValue.length === 0
                  ? 'bg-primary/10 text-primary font-bold'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-black dark:text-white'
              }`}
            >
              <span>{defaultAllText}</span>
            </div>

            {filtered.length > 0 ? (
              filtered.map((opt, idx) => {
                const isHighlighted = highlightedIndex === idx + 1;
                const isSelected = safeValue.includes(opt);
                return (
                  <div
                    key={opt}
                    onClick={() => toggleOption(opt)}
                    className={`p-2 rounded-lg cursor-pointer text-xs transition truncate flex items-center gap-2 ${
                      isHighlighted
                        ? 'bg-slate-100 dark:bg-slate-800'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                    title={opt}
                  >
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      readOnly
                      className="accent-primary w-3 h-3 cursor-pointer"
                    />
                    <span className={`flex-1 ${isSelected ? 'font-bold text-primary' : 'text-black dark:text-white'}`}>
                      {opt}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="p-3 text-center text-[11px] text-gray-400 italic">No matching {placeholder.replace(/^all\s+/i, '').toLowerCase()} found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableMultiSelect;
