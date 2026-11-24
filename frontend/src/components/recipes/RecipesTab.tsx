import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Recipe, RecipeGroup, MonthlyScheduleItem } from '../../types';
import {
  Plus,
  FolderPlus,
  Search,
} from 'lucide-react';

export const RecipesTab: React.FC = () => {
  const { openSheet, showToast, refreshKey, triggerRefresh } = useApp();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [groups, setGroups] = useState<RecipeGroup[]>([]);
  const [scheduleItems, setScheduleItems] = useState<MonthlyScheduleItem[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const loadData = async (showSpinner = recipes.length === 0) => {
    if (showSpinner) setLoading(true);
    try {
      const [allGroups, allRecipes, scheduleRes] = await Promise.all([
        api.getRecipeGroups(),
        api.getRecipes(selectedGroup || undefined, searchQuery || undefined),
        api.getMonthlySchedule(),
      ]);
      setGroups(allGroups);
      setRecipes(allRecipes);
      setScheduleItems(scheduleRes.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    loadData(recipes.length === 0);
  }, [selectedGroup, searchQuery, refreshKey]);

  // Map of recipeId -> number of unique scheduled active (non-skipped) days
  const recipeUsageMap = useMemo(() => {
    const map: Record<string, Set<number>> = {};
    for (const it of scheduleItems) {
      if (!it.is_skipped && it.recipe_id) {
        if (!map[it.recipe_id]) map[it.recipe_id] = new Set();
        map[it.recipe_id].add(it.day_of_month);
      }
    }
    const counts: Record<string, number> = {};
    for (const id in map) {
      counts[id] = map[id].size;
    }
    return counts;
  }, [scheduleItems]);

  return (
    <div className="space-y-4 pb-24 max-w-2xl mx-auto">
      {/* Header and Add Button */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white truncate">الوصفات والأكلات</h2>
          <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
            كتيب الطبخ ومكونات الأكلات وتكلفتها
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => openSheet('manage_recipe_groups')}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-200 text-[11px] sm:text-xs font-bold rounded-xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 transition-all active:scale-95 shadow-sm whitespace-nowrap shrink-0"
            title="إدارة وحذف التصنيفات"
          >
            <FolderPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600 dark:text-brand-400 shrink-0" />
            <span>التصنيفات</span>
          </button>
          <button
            onClick={() => openSheet('add_recipe')}
            className="flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-brand-600 hover:bg-brand-700 text-white text-[11px] sm:text-xs font-bold rounded-xl sm:rounded-2xl shadow-md shadow-brand-600/20 transition-all active:scale-95 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>وصفة جديدة</span>
          </button>
        </div>
      </div>

      {/* Search and Category Dropdown */}
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="ابحث عن وصفة بالاسم أو المكونات..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pr-10 pl-3.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm box-border"
          />
        </div>

        <select
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
          className="w-36 sm:w-44 h-10 px-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm cursor-pointer box-border"
        >
          <option value="">كل المجموعات</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name_ar}
            </option>
          ))}
        </select>
      </div>

      {/* Recipe Cards List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-gray-400">
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">جاري تحميل الوصفات...</p>
        </div>
      ) : recipes.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 text-center border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-2 text-gray-400">
            🍲
          </div>
          <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm mb-1">لا توجد وصفات</h4>
          <p className="text-xs text-gray-400 max-w-xs mx-auto mb-3">
            أضف وصفاتك المفضلة لحساب التكاليف وجدولة الوجبات تلقائياً.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
          {recipes.map((rec) => {
            const totalCount = rec.ingredients?.length ?? 0;
            const usedCount = recipeUsageMap[rec.id] || 0;
            const maxDays = rec.servings !== undefined ? rec.servings : 4;
            const isUnavailable = maxDays === 0;
            const isExceeded = usedCount > maxDays;
            const isLimitReached = usedCount === maxDays && maxDays > 0;

            return (
              <div
                key={rec.id}
                onClick={() => openSheet('recipe_detail', rec)}
                className={`bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm hover:border-brand-300 dark:hover:border-brand-700 transition-all flex flex-col justify-between group cursor-pointer ${isUnavailable
                  ? 'opacity-65 grayscale-[35%] bg-gray-100/70 dark:bg-gray-850/70 border-dashed border-gray-300 dark:border-gray-700'
                  : ''
                  }`}
              >
                {/* Photo & Availability Overlay */}
                <div
                  className="relative w-full aspect-[4/3] bg-gray-100 dark:bg-gray-800 overflow-hidden"
                >
                  <img
                    src={
                      rec.image_url ||
                      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300'
                    }
                    alt={rec.name_ar}
                    className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${isUnavailable ? 'grayscale-[40%]' : ''
                      }`}
                    loading="lazy"
                  />

                  {/* Badges Overlay */}
                  <div className="absolute top-2 right-2 left-2 flex items-center justify-between gap-1 pointer-events-none">
                    <span className="text-[10px] font-bold text-white bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full truncate max-w-[60%]">
                      {rec.group?.name_ar || 'أكلات عامة'}
                    </span>
                    {isUnavailable && (
                      <span className="text-[9px] sm:text-[10px] font-bold text-gray-700 bg-gray-200/95 dark:bg-gray-800 dark:text-gray-300 px-1.5 py-0.5 rounded-full shadow-sm border border-gray-300/80 dark:border-gray-700">
                        غير متاح
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-2.5 sm:p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h3
                      className="font-extrabold text-xs sm:text-sm text-gray-900 dark:text-white truncate group-hover:text-brand-600 transition-colors"
                      title={rec.name_ar}
                    >
                      {rec.name_ar}
                    </h3>

                    <div className="flex items-center justify-between mt-1.5 gap-1 flex-wrap">
                      {rec.total_cost ? (
                        <p className="text-[11px] font-extrabold text-brand-700 dark:text-brand-400 truncate">
                          {rec.total_cost.toLocaleString('ar-IQ')} د.ع
                        </p>
                      ) : (
                        <div />
                      )}

                      {/* Repetition Limit Hint: شكد مستخدم من العدد الكلي */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border flex-shrink-0 transition-colors ${isExceeded
                          ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-200 dark:border-red-900/50'
                          : isLimitReached
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50'
                            : isUnavailable
                              ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-300 dark:border-gray-700'
                              : usedCount > 0
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-900/50'
                                : 'bg-gray-100/90 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200/80 dark:border-gray-750'
                          }`}
                        title={
                          isExceeded
                            ? `تنبيه: عدد مرات الاستخدام (${usedCount}) تجاوز الحد الأقصى المسموح (${maxDays})`
                            : isUnavailable
                              ? 'هذه الأكلة غير متاحة للإضافة (تكرارها 0)'
                              : `مرات التكرار المستخدمة في جدول الشهر: ${usedCount} من أصل ${maxDays} أيام`
                        }
                      >
                        {isUnavailable && usedCount === 0
                          ? 'التكرارات : 0 من 0 (غير متاح)'
                          : `التكرارات : ${usedCount} من ${maxDays}`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
