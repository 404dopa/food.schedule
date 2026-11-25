import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { MonthlyScheduleItem, Recipe, MealSlot } from '../../types';
import {
  ChefHat,
  Trash2,
  Plus,
  Check,
  ChevronRight,
  SkipForward,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';

interface Props {
  dayOfMonth: number;
  year?: number;
  month?: number;
  items: MonthlyScheduleItem[];
  onSuccess: () => void;
}

export const DayScheduleSheet: React.FC<Props> = ({
  dayOfMonth,
  year,
  month,
  items,
  onSuccess,
}) => {
  const { showToast, showAlert, refreshKey } = useApp();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<MealSlot>('lunch');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [recipeSearch, setRecipeSearch] = useState<string>('');
  const [servings, setServings] = useState<number>(4);
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<'list' | 'add'>('list');
  const lastViewChangeTime = useRef<number>(Date.now());

  const daysInMonth = year && month ? new Date(year, month, 0).getDate() : 31;
  const isOverflowDay = dayOfMonth > daysInMonth;

  const [dayItems, setDayItems] = useState<MonthlyScheduleItem[]>(() =>
    items.filter((it) => it.day_of_month === dayOfMonth)
  );

  const refreshDayItems = async () => {
    try {
      const res = await api.getMonthlySchedule(year, month);
      const updated = (res.items || []).filter((it) => it.day_of_month === dayOfMonth);
      setDayItems(updated);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    setDayItems(items.filter((it) => it.day_of_month === dayOfMonth));
  }, [items, dayOfMonth]);

  useEffect(() => {
    if (refreshKey > 0) {
      refreshDayItems();
    }
  }, [refreshKey]);

  useEffect(() => {
    api.getRecipes().then((rList) => {
      setRecipes(rList);
      if (rList.length > 0) {
        setSelectedRecipeId(rList[0].id);
        setServings(rList[0].servings || 4);
      }
    });
  }, []);

  const filteredRecipes = useMemo(() => {
    if (!recipeSearch.trim()) return recipes;
    const q = recipeSearch.trim().toLowerCase();
    return recipes.filter(
      (r) =>
        r.name_ar.toLowerCase().includes(q) ||
        (r.name_en && r.name_en.toLowerCase().includes(q)) ||
        (r.group?.name_ar && r.group.name_ar.toLowerCase().includes(q))
    );
  }, [recipes, recipeSearch]);

  const handleRecipeChange = (id: string) => {
    setSelectedRecipeId(id);
    const selected = recipes.find((r) => r.id === id);
    if (selected && selected.servings !== undefined) {
      setServings(selected.servings);
    }
  };

  const handleOpenAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRecipeSearch('');
    lastViewChangeTime.current = Date.now();
    setView('add');
  };

  const handleBackToList = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    lastViewChangeTime.current = Date.now();
    setView('list');
  };

  const getRecipeUsedDays = (recipeId: string) => {
    // Skipped meals do not count against the monthly quota (returned to balance)
    return new Set(
      items
        .filter((it) => it.recipe_id === recipeId && !it.is_skipped)
        .map((it) => it.day_of_month)
    );
  };

  const handleTogglePrepareItem = async (item: MonthlyScheduleItem) => {
    if (item.is_skipped) return;
    const nextPrepared = !item.is_prepared;

    // Optimistic update
    setDayItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, is_prepared: nextPrepared, is_skipped: false } : it))
    );
    try {
      await api.saveMonthlyScheduleItem({
        ...item,
        is_prepared: nextPrepared,
        is_skipped: false,
      });
      showToast(
        nextPrepared
          ? 'تم تحديد الوجبة كمُحضرة ✓'
          : 'تم إلغاء حالة التحضير للوجبة',
        'info'
      );
      onSuccess();
      refreshDayItems();
    } catch (err: any) {
      showToast(err.message || 'فشل تحديث حالة التحضير', 'error');
      refreshDayItems();
    }
  };

  const handleToggleSkipItem = async (item: MonthlyScheduleItem) => {
    if (item.is_prepared) return;
    const nextSkipped = !item.is_skipped;
    if (!nextSkipped) {
      // Validate quota before unskipping
      const rec = recipes.find((r) => r.id === item.recipe_id);
      const recipeName = rec?.name_ar || 'هذه الأكلة';
      const maxDays = rec?.servings || 4;
      const usedDays = getRecipeUsedDays(item.recipe_id);
      if (usedDays.size >= maxDays) {
        showAlert(
          'تنبيه: لا يمكن إلغاء التخطي',
          `تم استنفاد الحد الأقصى المسموح لاختيار أكلة "${recipeName}" لهذا الشهر (${usedDays.size} من ${maxDays} أيام) في أيام أخرى.`,
          'لإتاحة فك التخطي وإعادة احتسابها في هذا اليوم، يرجى حذفها أو تخطيها أولاً من أحد الأيام الأخرى لتوفير رصيد استخدام.'
        );
        return;
      }
    }

    // Optimistic update
    setDayItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, is_skipped: nextSkipped, is_prepared: false } : it))
    );
    try {
      await api.saveMonthlyScheduleItem({
        ...item,
        is_skipped: nextSkipped,
        is_prepared: false,
      });
      showToast(
        nextSkipped
          ? 'تم تخطي الوجبة وإعادتها إلى رصيد الاستخدام الشهري'
          : 'تم إلغاء تخطي الوجبة واحتسابها من الرصيد',
        'info'
      );
      onSuccess();
      refreshDayItems();
    } catch (err: any) {
      showAlert(
        'تنبيه: لا يمكن إلغاء التخطي',
        err.message || 'فشل تحديث حالة الوجبة',
        'تأكد من وجود رصيد متاح لاستخدام هذه الأكلة هذا الشهر في جدولك.'
      );
      refreshDayItems();
    }
  };

  const handleSaveMeal = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Guard against ghost taps / click-through from view switch button
    if (Date.now() - lastViewChangeTime.current < 450) {
      return;
    }

    if (submitting) return;

    if (!selectedRecipeId) {
      showToast('يرجى اختيار أكلة', 'error');
      return;
    }

    const selectedRecipe = recipes.find((r) => r.id === selectedRecipeId);
    let swapNotice = '';
    if (selectedRecipe) {
      const maxDays = selectedRecipe.servings !== undefined ? selectedRecipe.servings : 4;
      if (maxDays === 0) {
        showToast('هذه الأكلة غير متاحة للإضافة لأن عدد تكراراتها محدد بـ 0', 'error');
        return;
      }
      const usedDaysSet = getRecipeUsedDays(selectedRecipe.id);
      const isAlreadyOnThisDay = usedDaysSet.has(dayOfMonth);
      if (!isAlreadyOnThisDay && usedDaysSet.size >= maxDays) {
        const futureDays = Array.from(usedDaysSet)
          .filter((d) => d > dayOfMonth)
          .sort((a, b) => a - b);
        if (futureDays.length > 0) {
          swapNotice = ` (وتم استبدالها مع يوم ${futureDays[0]} القادم)`;
        } else {
          showToast(
            `وصلت هذه الأكلة للحد الأقصى المسموح لاختيارها هذا الشهر (${maxDays} أيام) ولا توجد أيام قادمة لاستبدالها منها`,
            'warning'
          );
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const saved = await api.saveMonthlyScheduleItem({
        day_of_month: dayOfMonth,
        slot: selectedSlot,
        recipe_id: selectedRecipeId,
        servings: Number(servings),
        notes: notes || undefined,
      });

      // Immediate in-place local update
      const itemWithRecipe: MonthlyScheduleItem = {
        ...saved,
        recipe: selectedRecipe || saved.recipe,
      };

      setDayItems((prev) => {
        const withoutOldSlot = prev.filter(
          (it) => it.id !== saved.id && it.slot !== selectedSlot
        );
        return [...withoutOldSlot, itemWithRecipe];
      });

      showToast(`تم حفظ الوجبة لليوم ${dayOfMonth}${swapNotice}`, 'success');
      lastViewChangeTime.current = Date.now();
      setView('list');
      onSuccess();
    } catch (err: any) {
      showToast(err.message || 'فشل حفظ الوجبة', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    const target = dayItems.find((it) => it.id === id);
    if (target?.is_prepared || target?.is_skipped) {
      showToast('لا يمكن حذف الوجبة أثناء وجودها في حالة التحضير أو التخطي. يرجى التراجع أولاً.', 'warning');
      return;
    }
    // Immediate in-place deletion
    setDayItems((prev) => prev.filter((it) => it.id !== id));
    try {
      await api.deleteMonthlyScheduleItem(id);
      showToast('تم حذف الوجبة من هذا اليوم', 'info');
      onSuccess();
      refreshDayItems();
    } catch (err: any) {
      showToast(err.message, 'error');
      refreshDayItems();
    }
  };

  const getSlotTitle = (slot: MealSlot) => {
    switch (slot) {
      case 'breakfast':
        return 'فطور';
      case 'lunch':
        return 'غداء';
      case 'dinner':
        return 'عشاء';
      case 'snack':
        return 'سناك';
      default:
        return slot;
    }
  };

  const dateNumeric = isOverflowDay
    ? 'غير مشمول في الشهر الحالي (متاح للأشهر ذات 31 يوماً)'
    : year && month
    ? `${year}/${String(month).padStart(2, '0')}/${String(dayOfMonth).padStart(2, '0')}`
    : null;

  // View 2: Add Meal dedicated sub-view with Back Button
  if (view === 'add') {
    return (
      <div className="min-h-[440px] flex flex-col justify-between animate-fade-in">
        <div className="space-y-3">
          {/* Header Bar with Back Button, Title, and Save Button */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={handleBackToList}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold transition-all active:scale-95"
            >
              <ChevronRight className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span>رجوع</span>
            </button>

            <div className="flex items-center gap-1 text-xs font-extrabold text-brand-600 dark:text-brand-400">
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة أكلة لليوم {dayOfMonth}</span>
              {isOverflowDay && (
                <span className="text-[10px] text-red-500 font-bold mr-1">
                  (غير مشمول)
                </span>
              )}
            </div>

            {/* Save Button in Top Header */}
            <button
              type="button"
              onClick={() => handleSaveMeal()}
              disabled={submitting || !selectedRecipeId}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-sm shadow-emerald-600/20 transition-all disabled:opacity-40"
              title="حفظ وتثبيت الأكلة في جدول اليوم"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{submitting ? 'حفظ...' : 'حفظ'}</span>
            </button>
          </div>

          {/* Slot selector */}
          <div>
            <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1.5">
              موعد الوجبة:
            </label>
            <div className="grid grid-cols-4 gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl">
              {(['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`py-2 text-xs font-bold rounded-xl transition-all ${
                    selectedSlot === slot
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800'
                  }`}
                >
                  {getSlotTitle(slot)}
                </button>
              ))}
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              value={recipeSearch}
              onChange={(e) => setRecipeSearch(e.target.value)}
              placeholder="ابحث عن أكلة بالاسم..."
              className="w-full pr-9 pl-9 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-750 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
            <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" />
            {recipeSearch && (
              <button
                type="button"
                onClick={() => setRecipeSearch('')}
                className="absolute left-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Recipe Cards Grid */}
          <div>
            <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1.5">
              اختر الأكلة ({filteredRecipes.length}):
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-[380px] overflow-y-auto p-0.5">
              {filteredRecipes.length === 0 ? (
                <div className="col-span-2 py-8 text-center text-xs text-gray-400">
                  لا توجد أكلات تطابق البحث "{recipeSearch}"
                </div>
              ) : (
                filteredRecipes.map((r) => {
                  const usedDaysSet = getRecipeUsedDays(r.id);
                  const isAlreadyOnThisDay = usedDaysSet.has(dayOfMonth);
                  const maxDays = r.servings !== undefined ? r.servings : 4;
                  const isUnavailable = maxDays === 0;
                  const usedCount = usedDaysSet.size;
                  const isExceeded = usedCount > maxDays;
                  const isLimitReached = !isAlreadyOnThisDay && usedCount >= maxDays;
                  const futureDays = Array.from(usedDaysSet)
                    .filter((d) => d > dayOfMonth)
                    .sort((a, b) => a - b);
                  const canSwap = isLimitReached && !isUnavailable && futureDays.length > 0;
                  const isSelected = selectedRecipeId === r.id;

                  return (
                    <div
                      key={r.id}
                      onClick={() => {
                        if (!isUnavailable) {
                          handleRecipeChange(r.id);
                        }
                      }}
                      className={`relative rounded-2xl border overflow-hidden transition-all flex flex-col justify-between text-right cursor-pointer group ${
                        isSelected
                          ? 'border-brand-600 ring-2 ring-brand-500/30 bg-brand-50/20 dark:bg-brand-950/20 shadow-sm'
                          : isUnavailable
                          ? 'opacity-55 grayscale-[40%] bg-gray-100/60 dark:bg-gray-850/60 border-dashed border-gray-300 dark:border-gray-700 cursor-not-allowed'
                          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-brand-300 dark:hover:border-brand-700'
                      }`}
                    >
                      {/* Image Thumbnail */}
                      <div className="relative w-full aspect-[16/10] bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <img
                          src={
                            r.image_url ||
                            'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300'
                          }
                          alt={r.name_ar}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                        {/* Selected Indicator */}
                        {isSelected && (
                          <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-md">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                        {/* Status badge (swap/unavailable/exhausted) */}
                        <div className="absolute top-1.5 right-1.5 flex flex-col gap-0.5 pointer-events-none">
                          {isUnavailable ? (
                            <span className="text-[9px] font-bold text-gray-700 bg-gray-200/95 dark:bg-gray-800 dark:text-gray-300 px-1.5 py-0.5 rounded-full shadow-sm border border-gray-300/80">
                              غير متاح
                            </span>
                          ) : canSwap ? (
                            <span className="text-[9px] font-bold text-amber-700 bg-amber-100/95 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 rounded-full shadow-sm">
                              يستبدل 🔄
                            </span>
                          ) : isLimitReached ? (
                            <span className="text-[9px] font-bold text-red-700 bg-red-100/95 dark:bg-red-950 dark:text-red-300 px-1.5 py-0.5 rounded-full shadow-sm">
                              مستنفد
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-2 flex-1 flex flex-col justify-between gap-1">
                        <h4
                          className={`font-extrabold text-xs truncate ${
                            isSelected ? 'text-brand-600 dark:text-brand-400' : 'text-gray-900 dark:text-white'
                          }`}
                          title={r.name_ar}
                        >
                          {r.name_ar}
                        </h4>

                        <div className="flex items-center justify-between gap-1 text-[10px]">
                          <span
                            className={`font-bold px-1.5 py-0.5 rounded-md border text-[9px] ${
                              isExceeded
                                ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-200'
                                : isLimitReached
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200'
                                : isUnavailable
                                ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-300'
                                : usedCount > 0
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200'
                                : 'bg-gray-100/90 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200'
                            }`}
                          >
                            تكرار: {usedCount}/{maxDays}
                          </span>

                          {r.total_cost ? (
                            <span className="text-gray-500 dark:text-gray-400 font-bold truncate">
                              {r.total_cost.toLocaleString('ar-IQ')} د.ع
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // View 1: Main Meals List
  return (
    <div className="min-h-[440px] flex flex-col justify-between animate-fade-in">
      <div className="space-y-3.5">
        {/* Compact Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-brand-600 text-white font-mono font-black text-sm flex items-center justify-center shadow-sm">
              {dayOfMonth}
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-extrabold text-sm text-gray-900 dark:text-white leading-tight">
                  جدول يوم {dayOfMonth}
                </h3>
                {isOverflowDay && (
                  <span className="text-[10px] font-bold text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-1.5 py-0.5 rounded-md border border-red-200/80 dark:border-red-900/40">
                    غير مشمول
                  </span>
                )}
              </div>
              {dateNumeric && (
                <span className={`text-[10px] block ${isOverflowDay ? 'text-red-500/80 dark:text-red-400/80' : 'text-gray-400 font-mono'}`}>
                  {dateNumeric}
                </span>
              )}
            </div>
          </div>

          <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 border border-brand-200/60 dark:border-brand-900/40">
            {dayItems.length} وجبات
          </span>
        </div>

        {/* Existing Meals List for this day */}
        <div className="space-y-2">
          <h4 className="font-extrabold text-xs text-gray-800 dark:text-gray-200">
            الوجبات المحددة لليوم:
          </h4>

          {dayItems.length === 0 ? (
            <div className="p-6 bg-gray-50 dark:bg-gray-800/40 rounded-2xl text-center text-xs text-gray-400">
              لا توجد وجبات مسجلة لهذا اليوم.
            </div>
          ) : (
            <div className="space-y-1.5">
              {dayItems.map((item) => (
                <div
                  key={item.id}
                  className={`p-2.5 rounded-2xl border flex items-center justify-between transition-colors ${
                    item.is_skipped
                      ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/80'
                      : item.is_prepared
                      ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/80'
                      : 'bg-gray-50 dark:bg-gray-800/60 border-gray-100 dark:border-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        item.is_skipped
                          ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400'
                          : item.is_prepared
                          ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400'
                          : 'bg-brand-50 dark:bg-brand-950 text-brand-600'
                      }`}
                    >
                      <ChefHat className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-[10px] font-bold flex-shrink-0 ${
                            item.is_skipped
                              ? 'text-amber-600 dark:text-amber-400'
                              : item.is_prepared
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-brand-600 dark:text-brand-400'
                          }`}
                        >
                          {getSlotTitle(item.slot)}
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">•</span>
                        <h5
                          className={`font-bold text-xs truncate ${
                            item.is_skipped
                              ? 'text-amber-900 dark:text-amber-200 line-through opacity-85'
                              : item.is_prepared
                              ? 'text-emerald-950 dark:text-emerald-100 font-extrabold'
                              : 'text-gray-900 dark:text-white'
                          }`}
                        >
                          {item.recipe?.name_ar || 'أكلة غير محددة'}
                        </h5>
                        {item.is_skipped && (
                          <span className="text-[9px] font-extrabold text-amber-700 dark:text-amber-300 bg-amber-100/90 dark:bg-amber-900/60 px-1.5 py-0.5 rounded-md border border-amber-200/80 dark:border-amber-800/60">
                            تم التخطي (مُعاد للرصيد) ↩
                          </span>
                        )}
                        {item.is_prepared && !item.is_skipped && (
                          <span className="text-[9px] font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-100/90 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded-md border border-emerald-200/80 dark:border-emerald-800/60">
                            تم التحضير ✓
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] block truncate ${
                          item.is_skipped
                            ? 'text-amber-700/70 dark:text-amber-400/70'
                            : item.is_prepared
                            ? 'text-emerald-700/70 dark:text-emerald-400/70'
                            : 'text-gray-400'
                        }`}
                      >
                        {item.recipe?.group?.name_ar || 'أكلات عامة'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0 mr-1">
                    {/* Prepare Button */}
                    <button
                      type="button"
                      disabled={item.is_skipped}
                      onClick={() => handleTogglePrepareItem(item)}
                      className={`p-1.5 rounded-xl transition-all ${
                        item.is_prepared
                          ? 'text-emerald-600 bg-emerald-100/90 dark:bg-emerald-900/60 dark:text-emerald-300 hover:bg-emerald-200 shadow-xs active:scale-95'
                          : item.is_skipped
                          ? 'text-gray-300 dark:text-gray-700 opacity-30 cursor-not-allowed'
                          : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 active:scale-95'
                      }`}
                      title={
                        item.is_prepared
                          ? 'إلغاء حالة التحضير (تراجع)'
                          : item.is_skipped
                          ? 'لا يمكن التحضير لأن الوجبة متخطاة (تراجع عن التخطي أولاً)'
                          : 'تحديد الوجبة كمُحضرة'
                      }
                    >
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    </button>

                    {/* Skip Button */}
                    <button
                      type="button"
                      disabled={item.is_prepared}
                      onClick={() => handleToggleSkipItem(item)}
                      className={`p-1.5 rounded-xl transition-all ${
                        item.is_skipped
                          ? 'text-amber-600 bg-amber-100/90 dark:bg-amber-900/60 dark:text-amber-300 hover:bg-amber-200 shadow-xs active:scale-95'
                          : item.is_prepared
                          ? 'text-gray-300 dark:text-gray-700 opacity-30 cursor-not-allowed'
                          : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 active:scale-95'
                      }`}
                      title={
                        item.is_skipped
                          ? 'إلغاء التخطي واحتساب الوجبة من الرصيد (تراجع)'
                          : item.is_prepared
                          ? 'لا يمكن التخطي لأن الوجبة تم تحضيرها (تراجع عن التحضير أولاً)'
                          : 'تخطي الوجبة وإعادتها لرصيد الاستخدام الشهري'
                      }
                    >
                      {item.is_skipped ? (
                        <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                      ) : (
                        <SkipForward className="w-4 h-4" />
                      )}
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      disabled={item.is_prepared || item.is_skipped}
                      onClick={() => handleDeleteItem(item.id)}
                      className={`p-1.5 rounded-xl transition-all ${
                        item.is_prepared || item.is_skipped
                          ? 'text-gray-300 dark:text-gray-700 opacity-30 cursor-not-allowed'
                          : 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 active:scale-95'
                      }`}
                      title={
                        item.is_prepared
                          ? 'لا يمكن الحذف لأن الوجبة تم تحضيرها (تراجع عن التحضير أولاً)'
                          : item.is_skipped
                          ? 'لا يمكن الحذف لأن الوجبة متخطاة (تراجع عن التخطي أولاً)'
                          : 'حذف الأكلة من هذا اليوم'
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Button to Open Dedicated Add Meal View (anchored at bottom) */}
      <div className="pt-3 mt-auto">
        <button
          type="button"
          onClick={handleOpenAdd}
          className="w-full py-2.5 px-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-750 hover:border-brand-500 bg-gray-50/70 hover:bg-brand-50/30 dark:bg-gray-800/40 dark:hover:bg-brand-950/20 text-gray-700 hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-400 font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm"
        >
          <div className="w-5 h-5 rounded-lg bg-brand-100 dark:bg-brand-950 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <span>إضافة أكلة لهذا اليوم</span>
        </button>
      </div>
    </div>
  );
};
