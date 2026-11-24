import React, { useState } from 'react';
import { useApp, MainTab } from '../../context/AppContext';
import {
  Home,
  CalendarDays,
  Refrigerator,
  ShoppingCart,
  BookOpen,
  Lock,
  Layers,
  Sparkles,
  Info,
  Trash2,
  KeyRound,
  Loader2,
  X,
  LogOut,
  Users,
  Copy,
  CheckCheck,
} from 'lucide-react';
import { api } from '../../services/api';
import { clearAllLocalData } from '../../services/db';

interface TabConfigItem {
  id: MainTab;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isLocked?: boolean;
}

const tabConfigs: TabConfigItem[] = [
  {
    id: 'home',
    title: 'الرئيسية',
    description: 'لوحة التحكم اليومية ونظرة عامة على الوجبات والمؤونة',
    icon: Home,
    isLocked: true,
  },
  {
    id: 'schedule',
    title: 'الجدول',
    description: 'تقويم الوجبات الشهري الثابت وجدولة أيام الشهر',
    icon: CalendarDays,
  },
  {
    id: 'kitchen',
    title: 'المطبخ',
    description: 'إدارة المكونات والمخزون وحركات الاستهلاك وتنبيهات النقص',
    icon: Refrigerator,
  },
  {
    id: 'shopping',
    title: 'التسوق',
    description: 'قائمة المشتريات الذكية وتقدير التكلفة والإنجاز',
    icon: ShoppingCart,
  },
  {
    id: 'recipes',
    title: 'الوصفات',
    description: 'دليل الأكلات والمقادير وطرق التحضير وتكلفة الوجبة',
    icon: BookOpen,
  },
];

export const SettingsSheet: React.FC = () => {
  const { enabledTabs, toggleTabVisibility, showToast, triggerRefresh, closeSheet, userName, familyCode, logout } = useApp();

  // Copy family code state
  const [codeCopied, setCodeCopied] = useState(false);

  const handleCopyFamilyCode = () => {
    if (!familyCode) return;
    navigator.clipboard.writeText(familyCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  // Reset System State
  const [showResetModal, setShowResetModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleOpenResetModal = () => {
    setPin('');
    setPinError('');
    setShowResetModal(true);
  };

  const handleCloseResetModal = () => {
    if (isResetting) return;
    setShowResetModal(false);
    setPin('');
    setPinError('');
  };

  const handleConfirmReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isResetting) return;

    const trimmedPin = pin.trim();
    if (!trimmedPin) {
      setPinError('يرجى إدخال الرمز السري للمتابعة');
      return;
    }

    if (trimmedPin !== '1611') {
      setPinError('الرمز السري غير صحيح');
      return;
    }

    try {
      setIsResetting(true);
      setPinError('');

      // 1. Call backend to wipe database
      await api.resetSystem(trimmedPin);

      // 2. Clear local browser cache and IndexedDB tables
      await clearAllLocalData();

      showToast('تم تصفير كافة بيانات النظام بنجاح!', 'success');
      setShowResetModal(false);
      closeSheet();

      // 3. Trigger context refresh & soft reload to reset all active tabs
      triggerRefresh();
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (err: any) {
      const errorMsg = err?.message || 'حدث خطأ أثناء محاولة تصفير النظام';
      setPinError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6 pb-6">
      {/* First Section: Show Interfaces */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-base">
              إظهار الواجهات
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              اختر الواجهات التي تود إظهارها في شريط التنقل السفلي للتطبيق
            </p>
          </div>
        </div>

        <div className="space-y-2.5 mt-4">
          {tabConfigs.map((tab) => {
            const Icon = tab.icon;
            const isChecked = enabledTabs[tab.id];
            const isLocked = !!tab.isLocked;

            return (
              <label
                key={tab.id}
                onClick={(e) => {
                  if (isLocked) {
                    e.preventDefault();
                  }
                }}
                className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all select-none ${
                  isLocked
                    ? 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/60 cursor-default'
                    : isChecked
                    ? 'bg-white dark:bg-gray-800 border-brand-200 dark:border-brand-800/60 shadow-sm hover:border-brand-300 cursor-pointer'
                    : 'bg-white dark:bg-gray-800/60 border-gray-200 dark:border-gray-750 opacity-75 hover:opacity-100 hover:border-gray-300 cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                      isChecked
                        ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                        : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-400'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-900 dark:text-white">
                        {tab.title}
                      </span>
                      {isLocked && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                          <Lock className="w-2.5 h-2.5" />
                          دائماً مفعل
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {tab.description}
                    </p>
                  </div>
                </div>

                {/* Checkbox */}
                <div className="mr-3 flex items-center">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isLocked}
                    onChange={() => {
                      if (!isLocked) {
                        toggleTabVisibility(tab.id);
                      }
                    }}
                    className={`w-5 h-5 rounded-md border-gray-300 text-brand-600 focus:ring-brand-500 focus:ring-offset-0 transition-colors ${
                      isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                    }`}
                  />
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Info Notice */}
      <div className="p-3.5 rounded-2xl bg-brand-50/60 dark:bg-brand-950/30 border border-brand-100 dark:border-brand-900/40 flex items-start gap-2.5 text-xs text-brand-800 dark:text-brand-300 leading-relaxed">
        <Sparkles className="w-4 h-4 text-brand-600 dark:text-brand-400 flex-shrink-0 mt-0.5" />
        <div>
          يتم حفظ تفضيلات الواجهات على جهازك تلقائياً وستظهر فوراً في شريط التنقل بالأسفل. يمكنك تفعيل وإخفاء أي واجهة متى ما أردت.
        </div>
      </div>

      {/* System Reset Section */}
      <div className="pt-2 border-t border-gray-150 dark:border-gray-800">
        <button
          type="button"
          onClick={handleOpenResetModal}
          className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white text-xs font-bold rounded-2xl shadow-md shadow-red-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          <span>تصفير النظام</span>
        </button>
      </div>

      {/* App Info Section */}
      <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
        {/* Family Info */}
        {(userName || familyCode) && (
          <div className="mb-4 p-3.5 rounded-2xl bg-brand-50/60 dark:bg-brand-950/30 border border-brand-100 dark:border-brand-900/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-brand-800 dark:text-brand-300">
                <Users className="w-4 h-4 text-brand-600 dark:text-brand-400 flex-shrink-0" />
                <div>
                  {userName && (
                    <div className="font-bold">{userName}</div>
                  )}
                  {familyCode && (
                    <div className="text-brand-600 dark:text-brand-400 font-mono tracking-widest font-black">
                      رمز العائلة: {familyCode}
                    </div>
                  )}
                </div>
              </div>
              {familyCode && (
                <button
                  type="button"
                  onClick={handleCopyFamilyCode}
                  className="p-1.5 rounded-lg text-brand-500 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors"
                  title="نسخ رمز العائلة"
                >
                  {codeCopied ? (
                    <CheckCheck className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1.5">
            <Info className="w-4 h-4" />
            <span>تطبيق البيت (Al-Bayt) &bull; إصدار 1.0.0</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="font-medium text-emerald-600 dark:text-emerald-400">
              يعمل دون إنترنت
            </div>
            <button
              type="button"
              onClick={() => { closeSheet(); setTimeout(() => logout(), 100); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 font-bold text-xs transition-colors"
              title="تغيير المستخدم / تسجيل خروج"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </div>

      {/* PIN Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800 text-right animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-950 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">
                  تأكيد تصفير النظام
                </h4>
              </div>
              <button
                type="button"
                onClick={handleCloseResetModal}
                disabled={isResetting}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleConfirmReset} className="mt-4 space-y-4">
              <div className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                يرجى إدخال الرمز السري للمتابعة:
              </div>

              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    setPinError('');
                  }}
                  disabled={isResetting}
                  placeholder="أدخل الرمز السري"
                  className={`w-full text-center tracking-[0.3em] font-mono font-black text-lg py-3 px-4 rounded-xl border bg-gray-50 dark:bg-gray-800/80 text-gray-900 dark:text-white focus:outline-none transition-all ${
                    pinError
                      ? 'border-red-500 focus:ring-2 focus:ring-red-500/20'
                      : 'border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-red-500/20 focus:border-red-500'
                  }`}
                  autoFocus
                />
                {pinError && (
                  <p className="text-[11px] font-bold text-red-600 dark:text-red-400 text-center mt-1.5 animate-shake">
                    {pinError}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseResetModal}
                  disabled={isResetting}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isResetting || !pin.trim()}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-xs shadow-md shadow-red-600/20 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isResetting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري التصفير...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>تأكيد التصفير</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
