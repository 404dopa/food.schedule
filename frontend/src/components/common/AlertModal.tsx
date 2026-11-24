import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  details?: string;
}

export const AlertModal: React.FC<Props> = ({
  isOpen,
  onClose,
  title,
  message,
  details,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-amber-200/90 dark:border-amber-800/60 text-right animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
          <AlertTriangle className="w-6 h-6 stroke-[2.5]" />
        </div>

        <h3 className="font-black text-sm sm:text-base text-gray-900 dark:text-white text-center mb-2">
          {title}
        </h3>

        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed text-center mb-3">
          {message}
        </p>

        {details && (
          <div className="p-3 bg-amber-50/90 dark:bg-amber-950/40 rounded-2xl border border-amber-200/70 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200 font-medium leading-relaxed mb-4 text-center">
            {details}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 active:scale-98 text-white font-black text-xs rounded-2xl shadow-md shadow-brand-600/25 transition-all"
        >
          حسناً، فهمت
        </button>
      </div>
    </div>
  );
};
