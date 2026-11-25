import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { MealSlot, MonthlyScheduleItem, Recipe, RecipeGroup } from '../../types';
import { Sparkles, X, Loader2 } from 'lucide-react';

const slotLabels: { id: MealSlot; label: string }[] = [
  { id: 'breakfast', label: 'فطور' },
  { id: 'lunch', label: 'غداء' },
  { id: 'dinner', label: 'عشاء' },
  { id: 'snack', label: 'سناك' },
];

export const ScheduleTab: React.FC = () => {
  const { openSheet, refreshKey, triggerRefresh, showToast } = useApp();
  const today = new Date();
  const [currentYear] = useState<number>(today.getFullYear());
  const [currentMonth] = useState<number>(today.getMonth() + 1); // 1-12
  const [items, setItems] = useState<MonthlyScheduleItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [showDistributeModal, setShowDistributeModal] = useState(false);
  const [distSlot, setDistSlot] = useState<MealSlot>('lunch');
  const [distGroupId, setDistGroupId] = useState<string>('');
  const [groups, setGroups] = useState<RecipeGroup[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [distributing, setDistributing] = useState(false);

  // Compute days in this month
  const daysInCurrentMonth = new Date(currentYear, currentMonth, 0).getDate();

  const loadSchedule = async (showSpinner = items.length === 0) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await api.getMonthlySchedule(currentYear, currentMonth);
      setItems(res.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedule(items.length === 0);
  }, [currentYear, currentMonth, refreshKey]);

  // Group items by day_of_month
  const itemsByDay = items.reduce((acc, it) => {
    if (!acc[it.day_of_month]) acc[it.day_of_month] = [];
    acc[it.day_of_month].push(it);
    return acc;
  }, {} as Record<number, MonthlyScheduleItem[]>);

  const isCurrentMonthActual =
    today.getFullYear() === currentYear && today.getMonth() + 1 === currentMonth;
  const todayDateNum = today.getDate();

  const handleOpenDistribute = () => {
    setShowDistributeModal(true);
    if (groups.length === 0) {
      api.getRecipeGroups().then(setGroups).catch(() => {});
    }
    api.getRecipes().then(setRecipes).catch(() => {});
  };

  const matchingRecipes = recipes.filter((r) => {
    if (r.servings <= 0) return false;
    if (distGroupId && r.group_id !== distGroupId) return false;
    switch (distSlot) {
      case 'breakfast':
        return !!r.for_breakfast;
      case 'lunch':
        return !!r.for_lunch;
      case 'dinner':
        return !!r.for_dinner;
      case 'snack':
        return !!r.for_snack;
      default:
        return false;
    }
  });

  const handleConfirmDistribute = async () => {
    setDistributing(true);
    try {
      const res = await api.autoDistributeSchedule(
        distSlot,
        currentYear,
        currentMonth,
        distGroupId
      );
      setItems(res.items || []);
      setShowDistributeModal(false);
      triggerRefresh();
      const slotName = slotLabels.find((s) => s.id === distSlot)?.label || distSlot;
      showToast(`تم التوزيع الذكي لوجبة ${slotName} على ${res.assigned_count} يوم بنجاح`, 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل التوزيع التلقائي', 'error');
    } finally {
      setDistributing(false);
    }
  };

  return (
    <div className="space-y-4 pb-24 max-w-2xl mx-auto">
      {/* Header and Smart Distribute Button */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white truncate">
            الجدول
          </h2>
        </div>
        <button
          type="button"
          onClick={handleOpenDistribute}
          className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 bg-brand-600 hover:bg-brand-700 text-white text-[11px] sm:text-xs font-bold rounded-xl sm:rounded-2xl shadow-md shadow-brand-600/20 transition-all active:scale-95 whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span>توزيع ذكي</span>
        </button>
      </div>

      {/* Calendar Days Grid (3 columns across mobile) */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-gray-400">
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">جاري تحميل تقويم الوجبات...</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
            const isOverflow = day > daysInCurrentMonth;
            const dayMeals = itemsByDay[day] || [];
            const isToday = !isOverflow && isCurrentMonthActual && day === todayDateNum;

            return (
              <div
                key={day}
                onClick={() =>
                  openSheet('day_schedule', {
                    dayOfMonth: day,
                    year: currentYear,
                    month: currentMonth,
                    items: items,
                  })
                }
                className={`p-1.5 sm:p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between min-h-[80px] sm:min-h-[92px] ${
                  isToday
                    ? 'border-brand-500 bg-brand-50/40 dark:bg-brand-950/20 ring-2 ring-brand-500/30'
                    : isOverflow
                      ? 'border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 hover:border-red-300 dark:hover:border-red-800'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-brand-300 dark:hover:border-brand-700 shadow-xs'
                }`}
              >
                {/* Day Header */}
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-black font-mono px-1.5 py-0.5 rounded-md ${
                      isToday
                        ? 'bg-brand-600 text-white shadow-xs'
                        : isOverflow
                          ? 'bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300 border border-red-200/80 dark:border-red-900/50'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {day}
                  </span>
                  {isToday && (
                    <span className="text-[9px] font-black text-brand-600 dark:text-brand-400">
                      اليوم
                    </span>
                  )}
                  {isOverflow && (
                    <span className="text-[9px] font-bold text-red-400">
                      —
                    </span>
                  )}
                </div>

                {/* Meals Hints */}
                <div className="space-y-1 my-auto">
                  {dayMeals.length === 0 ? (
                    <span className={`text-[9px] sm:text-[10px] block text-center leading-tight ${isOverflow ? 'text-red-300 dark:text-red-800' : 'text-gray-400'}`}>
                      + أضف أكلة
                    </span>
                  ) : (
                    dayMeals.slice(0, 2).map((m) => (
                      <div
                        key={m.id}
                        className={`flex items-center justify-between gap-0.5 px-1 py-0.5 rounded-md text-[10px] truncate font-bold ${
                          m.is_skipped
                            ? 'bg-amber-100/90 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/80'
                            : m.is_prepared
                            ? 'bg-emerald-100/90 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-700/80'
                            : isOverflow
                            ? 'bg-red-100/60 dark:bg-red-950/40 text-red-800 dark:text-red-300'
                            : 'bg-gray-50 dark:bg-gray-800/80 text-gray-800 dark:text-gray-200'
                        }`}
                        title={
                          m.is_skipped
                            ? `${m.recipe?.name_ar} (تم التخطي)`
                            : m.is_prepared
                            ? `${m.recipe?.name_ar} (تم التحضير)`
                            : m.recipe?.name_ar
                        }
                      >
                        <span className={`truncate ${m.is_skipped ? 'line-through opacity-80' : ''}`}>
                          {m.recipe?.name_ar || 'وجبة'}
                        </span>
                        {m.is_skipped && (
                          <span className="text-[8px] font-black text-amber-600 dark:text-amber-400 flex-shrink-0">
                            ✕
                          </span>
                        )}
                        {m.is_prepared && !m.is_skipped && (
                          <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                            ✓
                          </span>
                        )}
                      </div>
                    ))
                  )}
                  {dayMeals.length > 2 && (
                    <span className={`text-[8px] block text-center ${isOverflow ? 'text-red-400 dark:text-red-500' : 'text-gray-400'}`}>
                      +{dayMeals.length - 2} أخرى
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Smart Distribute Modal */}
      {showDistributeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl p-5 shadow-2xl border border-gray-100 dark:border-gray-800 text-right animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">
                  توزيع الأكلات الذكي
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDistributeModal(false)}
                disabled={distributing}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">
                  اختر الوجبة المراد توزيعها على أيام الشهر
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {slotLabels.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setDistSlot(s.id)}
                      className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                        distSlot === s.id
                          ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-brand-300'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {groups.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1.5">
                    تصنيف الأكلات (اختياري)
                  </label>
                  <select
                    value={distGroupId}
                    onChange={(e) => setDistGroupId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">جميع الوصفات المتاحة</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name_ar}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="bg-gray-50 dark:bg-gray-800/60 p-3 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-gray-600 dark:text-gray-300">
                    الأكلات المحددة لهذه الوجبة:
                  </span>
                  <span className={matchingRecipes.length > 0 ? 'text-brand-600 dark:text-brand-400 font-black' : 'text-red-500 font-black'}>
                    {matchingRecipes.length} وصفات
                  </span>
                </div>
                {matchingRecipes.length > 0 ? (
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {matchingRecipes.map((r) => (
                      <span
                        key={r.id}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200"
                      >
                        {r.name_ar} ({r.servings})
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-red-500 dark:text-red-400 font-semibold leading-relaxed">
                    لا توجد وصفات محددة لوجبة {slotLabels.find((s) => s.id === distSlot)?.label}؛ افتح الوصفات وفعّل خيار الوجبة المطلوبة أولاً.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDistributeModal(false)}
                  disabled={distributing}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDistribute}
                  disabled={distributing || matchingRecipes.length === 0}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-brand-600 hover:bg-brand-700 active:scale-95 text-white font-black text-xs shadow-md shadow-brand-600/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {distributing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري التوزيع...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>توزيع الآن</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
