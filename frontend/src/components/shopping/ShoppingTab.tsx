import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import {
  Ingredient,
  IngredientGroup,
  MonthlyScheduleItem,
  Recipe,
  Unit,
} from '../../types';
import { formatQty } from '../../utils/format';
import {
  Check,
  Copy,
  RotateCcw,
} from 'lucide-react';

interface Period {
  id: number;
  start: number;
  end: number;
  name: string;
}

interface ShoppingIngredientItem {
  ingredient: Ingredient;
  totalNeeded: number;
  unitName: string;
  mealsCount: number;
  mealsInfo: { day: number; recipeName: string; qty: number }[];
  estimatedCost: number;
}

export const ShoppingTab: React.FC = () => {
  const { refreshKey, showToast } = useApp();

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-12
  const todayDay = today.getDate();
  const daysInCurrentMonth = new Date(currentYear, currentMonth, 0).getDate();

  // Define the 4 Month Periods (بدون تاريخ في الاسم)
  const periods: Period[] = useMemo(() => [
    { id: 0, start: 1, end: 7, name: 'الأسبوع 1' },
    { id: 1, start: 8, end: 14, name: 'الأسبوع 2' },
    { id: 2, start: 15, end: 21, name: 'الأسبوع 3' },
    { id: 3, start: 22, end: daysInCurrentMonth, name: 'الأسبوع 4' },
  ], [daysInCurrentMonth]);

  // Determine current week period index based on today's day of month
  const currentWeekIndex = useMemo(() => {
    if (todayDay <= 7) return 0;
    if (todayDay <= 14) return 1;
    if (todayDay <= 21) return 2;
    return 3;
  }, [todayDay]);

  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState<number>(currentWeekIndex);
  const [scheduleItems, setScheduleItems] = useState<MonthlyScheduleItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [groups, setGroups] = useState<IngredientGroup[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Local checklist storage for the selected period
  const storageKey = `bayti_shopping_checked_${currentYear}_${currentMonth}_${selectedPeriodIdx}`;
  const [checkedIds, setCheckedIds] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem(storageKey);
      return s ? JSON.parse(s) : [];
    } catch (_) {
      return [];
    }
  });

  useEffect(() => {
    try {
      const s = localStorage.getItem(storageKey);
      setCheckedIds(s ? JSON.parse(s) : []);
    } catch (_) {
      setCheckedIds([]);
    }
  }, [storageKey]);

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const clearChecks = () => {
    setCheckedIds([]);
    localStorage.removeItem(storageKey);
    showToast('تمت إعادة ضبط التحديد لهذا الأسبوع', 'info');
  };

  const loadData = async (showSpinner = scheduleItems.length === 0) => {
    if (showSpinner) setLoading(true);
    try {
      const [scheduleRes, allIngs, allGroups, allRecipes, allUnits] = await Promise.all([
        api.getMonthlySchedule(currentYear, currentMonth),
        api.getIngredients(),
        api.getIngredientGroups(),
        api.getRecipes(),
        api.getUnits(),
      ]);
      setScheduleItems(scheduleRes.items || []);
      setIngredients(allIngs);
      setGroups(allGroups);
      setRecipes(allRecipes);
      setUnits(allUnits);
    } catch (e) {
      console.error(e);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    loadData(scheduleItems.length === 0);
  }, [refreshKey, currentYear, currentMonth]);

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

  const activePeriod = periods[selectedPeriodIdx];

  // Strictly filter meals to the chosen period only
  const periodMeals = useMemo(() => {
    return scheduleItems.filter(
      (item) =>
        item.day_of_month >= activePeriod.start &&
        item.day_of_month <= activePeriod.end &&
        !item.is_skipped
    );
  }, [scheduleItems, activePeriod]);

  // Aggregate ingredients strictly needed within this period only
  const shoppingItems = useMemo(() => {
    const map: Record<string, ShoppingIngredientItem> = {};

    for (const item of periodMeals) {
      const recipe = item.recipe || recipesMap.get(item.recipe_id);
      if (!recipe || !recipe.ingredients) continue;

      const recipeServings = recipe.servings || 4;
      const mealServings = item.servings || recipeServings;
      const ratio = recipeServings > 0 ? mealServings / recipeServings : 1;

      for (const ri of recipe.ingredients) {
        const ingId = ri.ingredient_id || ri.ingredient?.id;
        if (!ingId) continue;
        const ing = ingredientsMap.get(ingId) || ri.ingredient;
        if (!ing) continue;

        const fromUnit = ri.unit || (ri.unit_id ? unitsMap.get(ri.unit_id) : undefined);
        const ingDefUnit =
          ing.default_unit ||
          (ing.default_unit_id ? unitsMap.get(ing.default_unit_id) : undefined) ||
          fromUnit;

        const scaledQty = (ri.quantity || 0) * ratio;
        const convertedQty = convertUnitQuantity(
          scaledQty,
          fromUnit,
          ingDefUnit,
          ing.density || 0
        );

        if (!map[ing.id]) {
          map[ing.id] = {
            ingredient: ing,
            totalNeeded: 0,
            unitName: ingDefUnit?.name_ar || fromUnit?.name_ar || 'وحدة',
            mealsCount: 0,
            mealsInfo: [],
            estimatedCost: 0,
          };
        }

        map[ing.id].totalNeeded += convertedQty;
        map[ing.id].mealsCount += 1;
        map[ing.id].mealsInfo.push({
          day: item.day_of_month,
          recipeName: recipe.name_ar,
          qty: convertedQty,
        });

        if (ing.unit_price > 0) {
          map[ing.id].estimatedCost += convertedQty * ing.unit_price;
        }
      }
    }

    return Object.values(map).sort((a, b) => {
      const gA = a.ingredient.group?.name_ar || '';
      const gB = b.ingredient.group?.name_ar || '';
      if (gA !== gB) return gA.localeCompare(gB, 'ar');
      return a.ingredient.name_ar.localeCompare(b.ingredient.name_ar, 'ar');
    });
  }, [periodMeals, recipesMap, ingredientsMap, unitsMap]);

  // Filter by category
  const filteredItems = useMemo(() => {
    return shoppingItems.filter((it) => {
      if (selectedGroup && it.ingredient.group_id !== selectedGroup) return false;
      return true;
    });
  }, [shoppingItems, selectedGroup]);

  const boughtCount = useMemo(() => {
    return shoppingItems.filter((it) => checkedIds.includes(it.ingredient.id)).length;
  }, [shoppingItems, checkedIds]);

  // Total estimated cost for this period
  const totalCost = useMemo(() => {
    return shoppingItems.reduce((acc, it) => acc + (it.estimatedCost || 0), 0);
  }, [shoppingItems]);

  // Copy shopping list to clipboard
  const handleCopyList = () => {
    if (shoppingItems.length === 0) return;
    const lines = [
      `🛒 قائمة تسوق ${activePeriod.name}:`,
      '--------------------------------',
      ...shoppingItems.map((it) => {
        const checkedMark = checkedIds.includes(it.ingredient.id) ? '✅ ' : '▫️ ';
        return `${checkedMark}${it.ingredient.name_ar}: ${formatQty(it.totalNeeded)} ${it.unitName}`;
      }),
      '--------------------------------',
      `إجمالي المواد: ${shoppingItems.length} مواد`,
      ...(totalCost > 0 ? [`الكلفة المتوقعة: ${Math.round(totalCost).toLocaleString('ar-IQ')} د.ع`] : []),
    ];

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    showToast('تم نسخ قائمة التسوق بنجاح إلى الحافظة', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-3 pb-24 max-w-2xl mx-auto">
      {/* Top Header: Title and Copy Button */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white truncate">
            احتياجات التسوق
          </h2>
          <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
            حساب كميات المواد المطلوبة حسب أسبوع الطبخ
          </p>
        </div>

        {/* Copy List Button */}
        <button
          type="button"
          onClick={handleCopyList}
          disabled={shoppingItems.length === 0}
          className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-[11px] sm:text-xs font-bold rounded-xl sm:rounded-2xl shadow-md shadow-brand-600/20 transition-all active:scale-95 whitespace-nowrap shrink-0"
          title="نسخ القائمة للمشاركة"
        >
          {copied ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white shrink-0" /> : <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />}
          <span>{copied ? 'تم النسخ' : 'نسخ القائمة'}</span>
        </button>
      </div>

      {/* Compact Week Periods Selector: الأسبوع 1 ، الأسبوع 2 ، الأسبوع 3 ، الأسبوع 4 (صغيرة وبدون تاريخ) */}
      <div className="grid grid-cols-4 gap-1.5 p-1 bg-gray-100 dark:bg-gray-800/80 rounded-2xl border border-gray-200/80 dark:border-gray-750">
        {periods.map((p) => {
          const isSelected = selectedPeriodIdx === p.id;
          const isTodayInThisPeriod = currentWeekIndex === p.id;

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPeriodIdx(p.id)}
              className={`py-2 px-1 rounded-xl text-xs font-black text-center transition-all relative active:scale-95 flex items-center justify-center gap-1 ${
                isSelected
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span>{p.name}</span>
              {isTodayInThisPeriod && (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isSelected ? 'bg-white' : 'bg-emerald-500'
                  }`}
                  title="الأسبوع الحالي"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Summary Bar */}
      <div className="flex items-center justify-between px-1 text-xs text-gray-500 dark:text-gray-400 font-bold">
        <div className="flex items-center gap-2">
          <span>المواد المطلوبة: {shoppingItems.length} مواد</span>
          {boughtCount > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              (تم شراء {boughtCount})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-emerald-700 dark:text-emerald-300 font-extrabold bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 shadow-xs">
            الكلفة المتوقعة: {Math.round(totalCost).toLocaleString('ar-IQ')} د.ع
          </span>
          {boughtCount > 0 && (
            <button
              type="button"
              onClick={clearChecks}
              className="text-gray-400 hover:text-red-500 text-[11px] flex items-center gap-0.5 transition-colors"
              title="إعادة ضبط المشتريات"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة ضبط</span>
            </button>
          )}
        </div>
      </div>

      {/* Group Badges Scroll */}
      {groups.length > 0 && shoppingItems.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedGroup('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              selectedGroup === ''
                ? 'bg-brand-600 text-white'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800'
            }`}
          >
            الكل ({shoppingItems.length})
          </button>
          {groups.map((g) => {
            const groupCount = shoppingItems.filter((i) => i.ingredient.group_id === g.id).length;
            if (groupCount === 0) return null;

            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGroup(g.id === selectedGroup ? '' : g.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${
                  selectedGroup === g.id
                    ? 'bg-brand-600 text-white'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800'
                }`}
              >
                <span>{g.name_ar}</span>
                <span className="text-[10px] opacity-75">({groupCount})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Items List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-gray-400">
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">جاري احتساب احتياجات الأسبوع...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 text-center border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-2 text-gray-400">
            🛍️
          </div>
          <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm mb-1">
            لا توجد احتياجات تسوق في {activePeriod.name}
          </h4>
          <p className="text-xs text-gray-400 max-w-xs mx-auto mb-3">
            {periodMeals.length === 0
              ? `لم تتم جدولة أي وجبات في ${activePeriod.name}. أضف أكلات في الجدول لتظهر احتياجاتها هنا.`
              : 'الrecipes المجدولة في هذا الأسبوع لم تُضف لها مقادير بعد.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((item) => {
            const isBought = checkedIds.includes(item.ingredient.id);

            return (
              <div
                key={item.ingredient.id}
                onClick={() => toggleCheck(item.ingredient.id)}
                className={`p-3.5 rounded-3xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isBought
                    ? 'bg-gray-50/80 dark:bg-gray-800/40 border-gray-200 dark:border-gray-800 opacity-60'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-brand-300 dark:hover:border-brand-700 shadow-xs'
                }`}
              >
                {/* Checkbox & Photo & Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCheck(item.ingredient.id);
                    }}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
                      isBought
                        ? 'bg-emerald-600 text-white'
                        : 'border-2 border-gray-300 dark:border-gray-600 hover:border-brand-500'
                    }`}
                  >
                    {isBought && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>

                  {/* Photo */}
                  <img
                    src={
                      item.ingredient.image_url ||
                      'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=150'
                    }
                    alt={item.ingredient.name_ar}
                    className="w-12 h-12 rounded-2xl object-cover bg-gray-100 dark:bg-gray-800 flex-shrink-0 border border-gray-100 dark:border-gray-800"
                    loading="lazy"
                  />

                  {/* Name and Usage in this period */}
                  <div className="min-w-0">
                    <h4
                      className={`font-extrabold text-sm text-gray-900 dark:text-white truncate ${
                        isBought ? 'line-through text-gray-400 dark:text-gray-500' : ''
                      }`}
                    >
                      {item.ingredient.name_ar}
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {item.ingredient.group?.name_ar || 'غير مصنف'}
                    </p>

                    {/* Breakdown of which meals need it in this period */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {item.mealsInfo.slice(0, 2).map((m, idx) => (
                        <span
                          key={idx}
                          className="text-[9px] font-bold px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-md"
                        >
                          يوم {m.day} ({m.recipeName})
                        </span>
                      ))}
                      {item.mealsInfo.length > 2 && (
                        <span className="text-[9px] text-gray-400">
                          +{item.mealsInfo.length - 2} وجبات أخرى
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Required Quantity in This Week Badge */}
                <div className="text-left flex-shrink-0">
                  <div
                    className={`px-3 py-1.5 rounded-2xl font-black text-xs sm:text-sm border ${
                      isBought
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80 shadow-xs'
                    }`}
                  >
                    {formatQty(item.totalNeeded)} {item.unitName}
                  </div>
                  {item.estimatedCost > 0 && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 font-bold mt-1 text-center">
                      ~{Math.round(item.estimatedCost).toLocaleString('ar-IQ')} د.ع
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
