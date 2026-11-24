import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Sun,
  Moon,
  FileSpreadsheet,
  Settings,
  ChevronLeft
} from 'lucide-react';

export const HomeQuickMenuSheet: React.FC = () => {
  const {
    networkStatus,
    syncNow,
    theme,
    toggleTheme,
    openSheet,
    closeSheet
  } = useApp();

  return (
    <div className="space-y-3.5 pb-6">
      {/* 1. Connection Status & Sync */}
      <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center ${
              networkStatus === 'online'
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                : networkStatus === 'syncing'
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'
                : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
            }`}
          >
            {networkStatus === 'online' && <Wifi className="w-5 h-5" />}
            {networkStatus === 'offline' && <WifiOff className="w-5 h-5" />}
            {networkStatus === 'syncing' && <RefreshCw className="w-5 h-5 animate-spin" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-gray-900 dark:text-white">
                حالة الاتصال
              </span>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  networkStatus === 'online'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : networkStatus === 'syncing'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                }`}
              >
                {networkStatus === 'online' ? 'متصل بالشبكة' : networkStatus === 'syncing' ? 'جاري المزامنة...' : 'دون اتصال (أوفلاين)'}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {networkStatus === 'online'
                ? 'البيانات متزامنة مع السيرفر المحلي'
                : 'يتم حفظ كافة العمليات محلياً ومزامنتها تلقائياً'}
            </p>
          </div>
        </div>

        <button
          onClick={syncNow}
          disabled={networkStatus === 'syncing'}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${networkStatus === 'syncing' ? 'animate-spin' : ''}`} />
          مزامنة
        </button>
      </div>

      {/* 2. Theme Mode Toggle */}
      <button
        onClick={toggleTheme}
        className="w-full p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 shadow-sm flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition-all text-right"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 dark:text-amber-400 flex items-center justify-center">
            {theme === 'dark' ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
          </div>
          <div>
            <div className="font-bold text-sm text-gray-900 dark:text-white">
              نمط العرض (Theme)
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {theme === 'dark' ? 'الوضع الليلي مفعّل حالياً' : 'الوضع النهاري مفعّل حالياً'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            {theme === 'dark' ? 'تبديل للنهاري' : 'تبديل لليلي'}
          </span>
          <ChevronLeft className="w-4 h-4 text-gray-400" />
        </div>
      </button>

      {/* 3. Excel Import & Export */}
      <button
        onClick={() => {
          closeSheet();
          setTimeout(() => openSheet('excel_modal'), 150);
        }}
        className="w-full p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 shadow-sm flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition-all text-right"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-sm text-gray-900 dark:text-white">
              استيراد وتصدير Excel
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              تصدير واستيراد المكونات والوصفات وملفات الجداول
            </p>
          </div>
        </div>

        <ChevronLeft className="w-4 h-4 text-gray-400" />
      </button>

      {/* 4. Settings */}
      <button
        onClick={() => {
          closeSheet();
          setTimeout(() => openSheet('settings'), 150);
        }}
        className="w-full p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 shadow-sm flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition-all text-right"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-sm text-gray-900 dark:text-white">
              التحكم والإعدادات
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              تخصيص الواجهات، تفضيلات التطبيق، وتصفير النظام
            </p>
          </div>
        </div>

        <ChevronLeft className="w-4 h-4 text-gray-400" />
      </button>
    </div>
  );
};
