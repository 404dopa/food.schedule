import React from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { MealPlanItem } from '../../types';
import {
  Calendar,
  CheckCircle,
  Plus,
  SkipForward,
  Sparkles,
  DollarSign,
  ChefHat,
} from 'lucide-react';

interface Props {
  todayStr: string;
  todayItems: MealPlanItem[];
  totalCost: number;
}

export const DailyDashboardSheet: React.FC<Props> = ({
  todayStr,
  todayItems,
  totalCost,
}) => {
  const { openSheet, showToast, closeSheet, triggerRefresh } = useApp();
  const numericDate = todayStr.replace(/-/g, '/');
  const preparedCount = todayItems.filter((i) => i.is_prepared).length;

  const handleSkipDay = async () => {
    try {
      await api.skipDay(todayStr, true);
      showToast('تم تخطي وجبات اليوم بنجاح', 'info');
      triggerRefresh();
      closeSheet();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Date & Overview Card */}
      <div className="bg-gradient-to-br from-brand-600 via-brand-700 to-emerald-800 text-white rounded-3xl p-5 shadow-lg shadow-brand-700/20 relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-brand-100 text-xs font-semibold bg-white/15 px-3 py-1 rounded-full">
            <Calendar className="w-3.5 h-3.5" />
            <span>تاريخ اليوم</span>
          </div>
          <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full font-bold">
            {preparedCount} من {todayItems.length} أُعدّت
          </span>
        </div>

        {/* Date: Numbers Only! */}
        <h2 className="text-3xl font-extrabold tracking-wider my-2 font-mono">
          {numericDate}
        </h2>

        <p className="text-brand-100 text-xs font-medium">
          إجمالي تكلفة وجبات اليوم التقديرية:{' '}
          <span className="font-extrabold text-white text-base">
            {totalCost.toLocaleString('ar-IQ')} د.ع
          </span>
        </p>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 gap-2.5">
        <button
          onClick={() => {
            closeSheet();
            openSheet('add_meal', { date: todayStr });
          }}
          className="w-full p-3.5 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 dark:hover:bg-brand-900/60 border border-brand-200 dark:border-brand-800 rounded-2xl flex items-center justify-between text-brand-800 dark:text-brand-200 font-bold text-xs transition-all"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-600 text-white flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <span>إضافة وجبة جديدة لليوم</span>
          </div>
          <span className="text-[11px] text-brand-600 dark:text-brand-400 font-normal">
            جدولة وجبة
          </span>
        </button>

        <button
          onClick={handleSkipDay}
          className="w-full p-3.5 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl flex items-center justify-between text-gray-800 dark:text-gray-200 font-bold text-xs transition-all"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center">
              <SkipForward className="w-4 h-4" />
            </div>
            <span>تخطي يوم {numericDate} بالكامل</span>
          </div>
          <span className="text-[11px] text-gray-400 font-normal">تعطيل وجبات اليوم</span>
        </button>

        <button
          onClick={() => {
            closeSheet();
            openSheet('smart_shopping');
          }}
          className="w-full p-3.5 bg-gradient-to-r from-emerald-50 to-brand-50 dark:from-emerald-950/30 dark:to-brand-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl flex items-center justify-between text-emerald-900 dark:text-emerald-200 font-bold text-xs transition-all"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <span>توليد قائمة تسوق ذكية</span>
          </div>
          <span className="text-[11px] text-emerald-600 font-normal">حساب النواقص آلياً</span>
        </button>
      </div>

      {/* Today's Meals Quick List */}
      <div className="pt-2">
        <h4 className="font-extrabold text-xs text-gray-900 dark:text-white mb-2">
          ملخص وجبات اليوم ({todayItems.length}):
        </h4>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {todayItems.map((item) => (
            <div
              key={item.id}
              className="p-2.5 bg-gray-50 dark:bg-gray-800/40 rounded-xl flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2">
                <ChefHat className="w-3.5 h-3.5 text-brand-600" />
                <span className="font-bold text-gray-800 dark:text-gray-200">
                  {item.recipe?.name_ar}
                </span>
                <span className="text-[11px] text-gray-400">({item.slot})</span>
              </div>
              <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">
                {item.is_prepared ? '✅ أُعدّت' : item.is_skipped ? '⏭️ تم التخطي' : '⏳ قيد الانتظار'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
