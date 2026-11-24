import React from 'react';
import { useApp } from '../../context/AppContext';
import { Moon, Sun, RefreshCw, FileSpreadsheet, Wifi, WifiOff, Settings } from 'lucide-react';

export const Header: React.FC = () => {
  const { theme, toggleTheme, networkStatus, syncNow, openSheet } = useApp();

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 py-3 safe-top">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-brand-500/20 font-black text-xl">
            🍲
          </div>
          <div>
            <h1 className="font-extrabold text-lg text-gray-900 dark:text-white leading-tight flex items-center gap-1.5">
              البيت
              <span className="text-xs font-medium px-2 py-0.5 bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 rounded-full">
                Al-Bayt
              </span>
            </h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
              إدارة المطبخ والمؤونة الذكية
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Sync & Connectivity Pill */}
          <button
            onClick={syncNow}
            title={networkStatus === 'online' ? 'متصل - اضغط للمزامنة' : 'غير متصل بالإنترنت'}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              networkStatus === 'online'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                : networkStatus === 'syncing'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
            }`}
          >
            {networkStatus === 'online' && <Wifi className="w-3.5 h-3.5" />}
            {networkStatus === 'offline' && <WifiOff className="w-3.5 h-3.5" />}
            {networkStatus === 'syncing' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span className="hidden sm:inline">
              {networkStatus === 'online' ? 'متصل' : networkStatus === 'syncing' ? 'مزامنة' : 'أوفلاين'}
            </span>
          </button>

          {/* Excel Import/Export Button */}
          <button
            onClick={() => openSheet('excel_modal')}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
            title="استيراد وتصدير إكسل"
          >
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </button>

          {/* Settings Button */}
          <button
            onClick={() => openSheet('settings')}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
            title="الإعدادات وتخصيص الواجهات"
          >
            <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors" />
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
            title={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-gray-600" />}
          </button>
        </div>
      </div>
    </header>
  );
};
