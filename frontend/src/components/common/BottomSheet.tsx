import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  maxHeight?: string;
  height?: string;
  hideHeader?: boolean;
  hideCloseButton?: boolean;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxHeight = 'max-h-[88vh]',
  height,
  hideHeader = false,
  hideCloseButton = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [currentTranslateY, setCurrentTranslateY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setCurrentTranslateY(0);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const deltaY = e.touches[0].clientY - startY;
    if (deltaY > 0) {
      setCurrentTranslateY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (currentTranslateY > 120) {
      onClose();
    } else {
      setCurrentTranslateY(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet Container */}
      <div
        ref={sheetRef}
        style={{
          transform: `translateY(${currentTranslateY}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className={`relative z-10 w-full max-w-xl bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl flex flex-col ${
          height ? `${height} ${maxHeight}` : maxHeight
        } overflow-hidden border-t border-gray-200 dark:border-gray-800 animate-slide-up`}
      >
        {/* Swipe Handle Bar */}
        <div
          className="w-full pt-3 pb-2 flex justify-center cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full" />
        </div>

        {/* Header */}
        {!hideHeader && (title || subtitle) && (
          <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100 dark:border-gray-800">
            <div>
              {title && <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>}
              {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
            {!hideCloseButton && (
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-full transition-colors"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className={`flex-1 overflow-y-auto px-5 ${hideHeader ? 'pt-2' : 'pt-4'} pb-8 sm:pb-10 safe-bottom`}>
          {children}
        </div>
      </div>
    </div>
  );
};
