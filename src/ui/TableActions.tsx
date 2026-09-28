import React, { useState, useEffect, useRef } from 'react';
import { MdEdit, MdDelete, MdVisibility, MdReplay, MdMoreHoriz } from 'react-icons/md';
import { FiPrinter } from 'react-icons/fi';

export type ActionVariant = 'edit' | 'delete' | 'print' | 'view' | 'return';

interface TableActionButtonProps {
  type: ActionVariant;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  disabled?: boolean;
}

const variantConfig: Record<
  ActionVariant,
  {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    defaultTitle: string;
    classes: string;
    menuItemClasses: string;
  }
> = {
  print: {
    icon: FiPrinter,
    defaultTitle: 'Print Record',
    classes:
      'bg-emerald-50 hover:bg-emerald-100/90 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-800/60 shadow-xs hover:border-emerald-300',
    menuItemClasses:
      'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40',
  },
  view: {
    icon: MdVisibility,
    defaultTitle: 'View Details',
    classes:
      'bg-slate-100 hover:bg-slate-200/90 text-slate-700 border-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700 shadow-xs hover:border-slate-300',
    menuItemClasses:
      'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  },
  return: {
    icon: MdReplay,
    defaultTitle: 'Process Return',
    classes:
      'bg-teal-50 hover:bg-teal-100/90 text-teal-700 border-teal-200/80 dark:bg-teal-950/40 dark:hover:bg-teal-900/60 dark:text-teal-300 dark:border-teal-800/60 shadow-xs hover:border-teal-300',
    menuItemClasses:
      'text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40',
  },
  edit: {
    icon: MdEdit,
    defaultTitle: 'Edit Record',
    classes:
      'bg-amber-50 hover:bg-amber-100/90 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 dark:text-amber-300 dark:border-amber-800/60 shadow-xs hover:border-amber-300',
    menuItemClasses:
      'text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40',
  },
  delete: {
    icon: MdDelete,
    defaultTitle: 'Delete Record',
    classes:
      'bg-rose-50 hover:bg-rose-100/90 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-300 dark:border-rose-800/60 shadow-xs hover:border-rose-300',
    menuItemClasses:
      'text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 border-t border-slate-100 dark:border-slate-800/80 mt-1 pt-1 font-semibold',
  },
};

export const TableActionButton: React.FC<TableActionButtonProps> = ({
  type,
  onClick,
  title,
  disabled = false,
}) => {
  const config = variantConfig[type];
  const IconComponent = config.icon;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title || config.defaultTitle}
      className={`inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg border text-xs transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${config.classes}`}
    >
      <IconComponent size={15} />
    </button>
  );
};

export interface TableActionsProps {
  onPrint?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onView?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onReturn?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onEdit?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onDelete?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  printTitle?: string;
  viewTitle?: string;
  returnTitle?: string;
  editTitle?: string;
  deleteTitle?: string;
  children?: React.ReactNode;
  collapseThreshold?: number; // Defaults to 2: if > 2 actions, collapses into ...
}

export const TableActions: React.FC<TableActionsProps> = ({
  onPrint,
  onView,
  onReturn,
  onEdit,
  onDelete,
  printTitle,
  viewTitle,
  returnTitle,
  editTitle,
  deleteTitle,
  children,
  collapseThreshold = 2,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Build the list of active actions
  const actionList: {
    type: ActionVariant;
    handler: (e: React.MouseEvent<HTMLButtonElement>) => void;
    title: string;
  }[] = [];

  if (onPrint) actionList.push({ type: 'print', handler: onPrint, title: printTitle || 'Print Record' });
  if (onView) actionList.push({ type: 'view', handler: onView, title: viewTitle || 'View Details' });
  if (onReturn) actionList.push({ type: 'return', handler: onReturn, title: returnTitle || 'Process Return' });
  if (onEdit) actionList.push({ type: 'edit', handler: onEdit, title: editTitle || 'Edit Record' });
  if (onDelete) actionList.push({ type: 'delete', handler: onDelete, title: deleteTitle || 'Delete Record' });

  // Determine if we should collapse into a "..." menu
  const shouldCollapse = actionList.length > collapseThreshold;

  // Toggle Menu & compute position
  const handleToggleMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuCoords({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    setIsOpen((prev) => !prev);
  };

  // Close when clicking outside or scrolling
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // If 2 or fewer actions, display inline buttons
  if (!shouldCollapse) {
    return (
      <div className="flex items-center justify-center gap-1.5 flex-nowrap">
        {actionList.map((action) => (
          <TableActionButton
            key={action.type}
            type={action.type}
            onClick={action.handler}
            title={action.title}
          />
        ))}
        {children}
      </div>
    );
  }

  // If > 2 actions, display the refined "..." dropdown trigger
  return (
    <div className="relative inline-flex items-center justify-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggleMenu}
        title="More Actions"
        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-xs font-bold transition-all duration-150 active:scale-95 cursor-pointer shadow-xs ${
          isOpen
            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-500/20'
            : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700'
        }`}
      >
        <MdMoreHoriz size={18} />
      </button>

      {/* Floating Dropdown Menu (Fixed Coordinates prevents Table Overflow Clipping) */}
      {isOpen && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: `${menuCoords.top}px`,
            right: `${menuCoords.right}px`,
          }}
          className="z-99999 w-48 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-[#111827]/95 p-1 shadow-xl backdrop-blur-md text-left text-xs animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col font-medium">
            {actionList.map((action) => {
              const config = variantConfig[action.type];
              const IconComp = config.icon;

              return (
                <button
                  key={action.type}
                  type="button"
                  onClick={(e) => {
                    setIsOpen(false);
                    action.handler(e);
                  }}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg transition duration-150 cursor-pointer text-left font-semibold ${config.menuItemClasses}`}
                >
                  <IconComp size={15} className="shrink-0" />
                  <span>{action.title}</span>
                </button>
              );
            })}
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

export default TableActions;
