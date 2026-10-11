import React, { useState, useEffect, useCallback } from 'react';
import { MdErrorOutline, MdClose } from 'react-icons/md';
import { ErrorPopupDetail } from '../utils/errorPopup';

const ErrorPopupModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [modalData, setModalData] = useState<{ message: string; title: string }>({
    message: '',
    title: 'Notice'
  });

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const handleEvent = (event: Event) => {
      const customEvent = event as CustomEvent<ErrorPopupDetail>;
      if (customEvent.detail) {
        setModalData({
          message: customEvent.detail.message || 'An error occurred.',
          title: customEvent.detail.title || 'Notice'
        });
        setIsOpen(true);
      }
    };

    window.addEventListener('app:show-error-popup', handleEvent);
    return () => {
      window.removeEventListener('app:show-error-popup', handleEvent);
    };
  }, []);

  // Support Escape / Enter key to dismiss
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="w-full max-w-md bg-white dark:bg-boxdark rounded-2xl border border-stroke dark:border-strokedark shadow-2xl p-6 space-y-5 transition-colors duration-200 transform scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Icon and Close Button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 flex items-center justify-center text-2xl shrink-0 shadow-xs">
              <MdErrorOutline />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-black dark:text-white tracking-tight">
                {modalData.title}
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                AL Muhammadi ERP Notification
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-meta-4 transition cursor-pointer"
            title="Close"
          >
            <MdClose size={18} />
          </button>
        </div>

        {/* Message Content */}
        <div className="py-1">
          <div className="text-xs sm:text-sm text-gray-700 dark:text-gray-200 font-medium leading-relaxed bg-gray-50 dark:bg-meta-4/20 border border-stroke dark:border-strokedark rounded-xl p-3.5 max-h-60 overflow-y-auto whitespace-pre-line break-words">
            {modalData.message}
          </div>
        </div>

        {/* Action Button: OK Only (No navigation / stays on same page) */}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            autoFocus
            onClick={handleClose}
            className="w-full sm:w-auto min-w-[100px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs shadow-md hover:shadow-lg transition cursor-pointer flex items-center justify-center text-center"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorPopupModal;
