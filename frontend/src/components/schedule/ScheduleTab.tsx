import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { MonthlyScheduleItem } from '../../types';

export const ScheduleTab: React.FC = () => {
  const { openSheet, refreshKey } = useApp();
  const today = new Date();
  const [currentYear] = useState<number>(today.getFullYear());
  const [currentMonth] = useState<number>(today.getMonth() + 1); // 1-12
  const [items, setItems] = useState<MonthlyScheduleItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

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

  return (
    <div className="space-y-4 pt-2 pb-24 max-w-2xl mx-auto">
      {/* Calendar Days Grid (4 columns across mobile) */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-gray-400">
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">جاري تحميل تقويم الوجبات...</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
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
    </div>
  );
};
