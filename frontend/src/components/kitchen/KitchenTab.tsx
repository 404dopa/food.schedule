import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Ingredient, IngredientGroup, MonthlyScheduleItem, Recipe, Unit } from '../../types';
import { formatQty } from '../../utils/format';
import {
  Plus,
  FolderPlus,
  Search,
  Edit2,
  CalendarDays,
  CheckCircle2,
  PackageOpen,
  ChefHat,
} from 'lucide-react';

export const KitchenTab: React.FC = () => {
  const { openSheet, refreshKey } = useApp();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [groups, setGroups] = useState<IngredientGroup[]>([]);
  const [scheduleItems, setScheduleItems] = useState<MonthlyScheduleItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'needed'>('all');
  const [loading, setLoading] = useState(true);

  const loadData = async (showSpinner = ingredients.length === 0) => {
    if (showSpinner) setLoading(true);
    try {
      const [allGroups, allIngs, scheduleRes, allRecipes, allUnits] = await Promise.all([
        api.getIngredientGroups(),
        api.getIngredients(selectedGroup || undefined, searchQuery || undefined),
        api.getMonthlySchedule(),
        api.getRecipes(),
        api.getUnits(),
      ]);
      setGroups(allGroups);
      setIngredients(allIngs);
      setScheduleItems(scheduleRes.items || []);
      setRecipes(allRecipes);
      setUnits(allUnits);
    } catch (e) {
      console.error(e);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    loadData(ingredients.length === 0);
  }, [selectedGroup, searchQuery, refreshKey]);

  // Unit conversion helper
  const convertUnitQuantity = (
    val: number,
    fromUnit?: Unit,
    toUnit?: Unit,
    density = 0
  ): number => {
    if (!fromUnit || !toUnit || val === 0) return val;
    if (fromUnit.id === toUnit.id || fromUnit.code.toLowerCase() === toUnit.code.toLowerCase()) {
      return val;
    }
    if (fromUnit.dimension === toUnit.dimension) {
      if (!toUnit.factor_to_base) return val;
      const inBase = val * fromUnit.factor_to_base;
      return inBase / toUnit.factor_to_base;
    }
    if (
      (fromUnit.dimension === 'mass' && toUnit.dimension === 'volume') ||
      (fromUnit.dimension === 'volume' && toUnit.dimension === 'mass')
    ) {
      if (density <= 0) return val;
      if (fromUnit.dimension === 'mass' && toUnit.dimension === 'volume') {
        const grams = val * fromUnit.factor_to_base;
        const ml = grams / density;
        return ml / toUnit.factor_to_base;
      } else {
        const ml = val * fromUnit.factor_to_base;
        const grams = ml * density;
        return grams / toUnit.factor_to_base;
      }
    }
    return val;
  };

  const recipesMap = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const unitsMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const ingredientsMap = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  // Calculate required quantities automatically from added meals in the schedule
  const ingredientStats = useMemo(() => {
    const stats: Record<
      string,
      {
        totalNeeded: number;
        mealsCount: number;
        recipesUsed: { name: string; count: number }[];
      }
    > = {};

    for (const item of scheduleItems) {
      if (item.is_skipped) continue;
      const recipe = item.recipe || recipesMap.get(item.recipe_id);
      if (!recipe || !recipe.ingredients) continue;

      const recipeServings = recipe.servings || 4;
      const mealServings = item.servings || recipeServings;
      const ratio = recipeServings > 0 ? mealServings / recipeServings : 1;

      for (const ri of recipe.ingredients) {
        if (!ri.ingredient_id) continue;
        const ing = ingredientsMap.get(ri.ingredient_id) || ri.ingredient;
        const ingDefUnit =
          ing?.default_unit ||
          (ing?.default_unit_id ? unitsMap.get(ing.default_unit_id) : undefined);
        const fromUnit = ri.unit || (ri.unit_id ? unitsMap.get(ri.unit_id) : undefined);

        const scaledQty = (ri.quantity || 0) * ratio;
        const convertedQty = convertUnitQuantity(
          scaledQty,
          fromUnit,
          ingDefUnit,
          ing?.density || 0
        );

        if (!stats[ri.ingredient_id]) {
          stats[ri.ingredient_id] = {
            totalNeeded: 0,
            mealsCount: 0,
            recipesUsed: [],
          };
        }
        stats[ri.ingredient_id].totalNeeded += convertedQty;
        stats[ri.ingredient_id].mealsCount += 1;

        const recName = recipe.name_ar;
        const existing = stats[ri.ingredient_id].recipesUsed.find((r) => r.name === recName);
        if (existing) {
          existing.count += 1;
        } else {
          stats[ri.ingredient_id].recipesUsed.push({ name: recName, count: 1 });
        }
      }
    }

    return stats;
  }, [scheduleItems, recipesMap, unitsMap, ingredientsMap]);

  // Filter ingredients
  const filteredIngredients = useMemo(() => {
    return ingredients.filter((item) => {
      if (filterMode === 'needed') {
        const stat = ingredientStats[item.id];
        return stat && stat.totalNeeded > 0;
      }
      return true;
    });
  }, [ingredients, filterMode, ingredientStats]);

  const neededIngredientsCount = useMemo(() => {
    return ingredients.filter((ing) => (ingredientStats[ing.id]?.totalNeeded || 0) > 0).length;
  }, [ingredients, ingredientStats]);

  return (
    <div className="space-y-4 pb-24 max-w-2xl mx-auto">
      {/* Header and Add Buttons */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white truncate">المكونات</h2>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => openSheet('manage_ingredient_groups')}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-200 text-[11px] sm:text-xs font-bold rounded-xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 transition-all active:scale-95 shadow-sm whitespace-nowrap shrink-0"
            title="إضافة وإدارة مجموعات المكونات"
          >
            <FolderPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600 dark:text-brand-400 shrink-0" />
            <span>مجموعة</span>
          </button>
          <button
            onClick={() => openSheet('add_ingredient')}
            className="flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-brand-600 hover:bg-brand-700 text-white text-[11px] sm:text-xs font-bold rounded-xl sm:rounded-2xl shadow-md shadow-brand-600/20 transition-all active:scale-95 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>مكون</span>
          </button>
        </div>
      </div>

      {/* Quick Filter: All vs Needed in Schedule */}
      <div className="grid grid-cols-2 gap-2 bg-gray-100 dark:bg-gray-800/70 p-1 rounded-2xl border border-gray-200/80 dark:border-gray-700/60">
        <button
          type="button"
          onClick={() => setFilterMode('all')}
          className={`py-2 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${
            filterMode === 'all'
              ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <PackageOpen className="w-4 h-4 text-brand-500" />
          <span>كل المكونات</span>
        </button>
        <button
          type="button"
          onClick={() => setFilterMode('needed')}
          className={`py-2 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${
            filterMode === 'needed'
              ? 'bg-white dark:bg-gray-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <CalendarDays className="w-4 h-4 text-emerald-500" />
          <span>المطلوبة بالجدول</span>
        </button>
      </div>

      {/* Search and Category Dropdown */}
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="ابحث عن مكون بالاسم..."
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

      {/* Ingredients Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-gray-400">
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">جاري تحميل المكونات والكميات المطلوبة...</p>
        </div>
      ) : filteredIngredients.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 text-center border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-2 text-gray-400">
            🥕
          </div>
          <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm mb-1">
            {filterMode === 'needed' ? 'لا توجد مكونات مطلوبة حالياً' : 'لا توجد نتائج مطابقة'}
          </h4>
          <p className="text-xs text-gray-400 max-w-xs mx-auto mb-3">
            {filterMode === 'needed'
              ? 'لم يتم تعيين وجبات تتطلب مكونات في جدول الشهر بعد.'
              : 'لم نجد أي مكون مطابق لبحثك أو التصنيف المختار.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredIngredients.map((ing) => {
            const unitName = ing.default_unit?.name_ar || 'وحدة';
            const stat = ingredientStats[ing.id] || { totalNeeded: 0, mealsCount: 0, recipesUsed: [] };
            const isNeeded = stat.totalNeeded > 0;

            return (
              <div
                key={ing.id}
                className="bg-white dark:bg-gray-900 rounded-3xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col justify-between hover:border-brand-300 dark:hover:border-brand-700 transition-all"
              >
                <div className="flex items-start gap-3">
                  {/* Ingredient Image */}
                  <img
                    src={
                      ing.image_url ||
                      'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=200'
                    }
                    alt={ing.name_ar}
                    className="w-16 h-16 rounded-2xl object-cover bg-gray-100 dark:bg-gray-800 flex-shrink-0 border border-gray-100 dark:border-gray-800"
                    loading="lazy"
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="font-extrabold text-sm text-gray-900 dark:text-white truncate">
                        {ing.name_ar}
                      </h4>
                      <button
                        onClick={() => openSheet('edit_ingredient', ing)}
                        className="text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 p-1 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        title="تعديل المكون"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-[11px] text-gray-400 font-medium">
                      {ing.group?.name_ar || 'غير مصنف'}
                    </p>
                  </div>
                </div>

                {/* Required Quantity Box (حساب تلقائي من الأكلات المضافة) */}
                <div
                  className={`mt-3 p-2.5 rounded-2xl border transition-all ${
                    isNeeded
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/60'
                      : 'bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">
                      الكمية المطلوبة:
                    </span>
                    <span
                      className={`text-xs font-black ${
                        isNeeded
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {formatQty(stat.totalNeeded)} {unitName}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
                    <span>
                      {isNeeded
                        ? `مطلوب لـ ${stat.mealsCount} وجبة في الجدول`
                        : 'غير مستخدم بأكلات هذا الشهر'}
                    </span>
                    {isNeeded && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>محسوبة</span>
                      </span>
                    )}
                  </div>

                  {/* List of meals using this ingredient if any */}
                  {stat.recipesUsed.length > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-emerald-100 dark:border-emerald-900/40 flex flex-wrap gap-1">
                      {stat.recipesUsed.slice(0, 3).map((r, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-white/80 dark:bg-gray-900/80 text-emerald-800 dark:text-emerald-300 rounded-md text-[9px] font-bold border border-emerald-200/50 dark:border-emerald-800/40"
                        >
                          {r.name} {r.count > 1 ? `(${r.count})` : ''}
                        </span>
                      ))}
                      {stat.recipesUsed.length > 3 && (
                        <span className="text-[9px] text-gray-400 self-center">
                          +{stat.recipesUsed.length - 3} أخرى
                        </span>
                      )}
                    </div>
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
