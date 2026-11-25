import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { clearAllLocalData } from '../../services/db';
import { MealPlanItem, MealSlot } from '../../types';
import { formatQty, normalizeArabicNumerals } from '../../utils/format';
import {
  CheckCircle,
  SkipForward,
  RotateCcw,
  ChefHat,
  AlertTriangle,
  X,
  Pencil,
  Users,
  LogOut,
  Loader2,
  ArrowLeftRight,
} from 'lucide-react';

const slotOrder: Record<MealSlot, number> = {
  breakfast: 1,
  lunch: 2,
  dinner: 3,
  snack: 4,
};

export const HomeTab: React.FC = () => {
  const {
    openSheet,
    showToast,
    showAlert,
    refreshKey,
    triggerRefresh,
    userName,
    familyCode,
    householdId,
    logout,
    updateSession,
  } = useApp();
  const [allTwoDayItems, setAllTwoDayItems] = useState<MealPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [activeMissingPopoverId, setActiveMissingPopoverId] = useState<string | null>(null);

  // User Options Menu & Modals State
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editNameInput, setEditNameInput] = useState('');
  const [showChangeFamilyModal, setShowChangeFamilyModal] = useState(false);
  const [changeFamilyInput, setChangeFamilyInput] = useState('');
  const [changeFamilyError, setChangeFamilyError] = useState('');
  const [changeFamilyLoading, setChangeFamilyLoading] = useState(false);
  const [suggestCreateFamily, setSuggestCreateFamily] = useState(false);

  const [selectedDayMode, setSelectedDayMode] = useState<'today' | 'tomorrow'>('today');
  const autoSwitchedForDateRef = useRef<string | null>(null);

  const formatDateLocal = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = formatDateLocal(new Date());
  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatDateLocal(d);
  })();

  const activeDateStr = selectedDayMode === 'today' ? todayStr : tomorrowStr;

  const todayItems = useMemo(() => {
    return allTwoDayItems
      .filter((it) => it.plan_date === activeDateStr)
      .sort((a, b) => (slotOrder[a.slot] || 99) - (slotOrder[b.slot] || 99));
  }, [allTwoDayItems, activeDateStr]);

  // Greeting based on time of day
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'صباح الخير';
    if (hour >= 12 && hour < 18) return 'مساء الخير';
    return 'مساء الخير';
  })();

  const loadDayMeals = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const items = await api.getMealPlans(todayStr, tomorrowStr);
      setAllTwoDayItems(items);

      // Auto-switch from Today to Tomorrow once all of Today's meals are prepared or skipped
      const todayOnly = items.filter((it) => it.plan_date === todayStr);
      const allDone = todayOnly.length > 0 && todayOnly.every((it) => it.is_prepared || it.is_skipped);
      if (allDone) {
        if (autoSwitchedForDateRef.current !== todayStr) {
          autoSwitchedForDateRef.current = todayStr;
          setSelectedDayMode('tomorrow');
        }
      } else {
        autoSwitchedForDateRef.current = null;
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    loadDayMeals(allTwoDayItems.length === 0);
  }, [refreshKey]);

  const isDaySkipped = todayItems.length > 0 && todayItems.every((it) => it.is_skipped);

  const handleToggleSkipDay = async () => {
    const nextSkip = !isDaySkipped;
    // Optimistic update keeps scroll position and switches instantly
    setAllTwoDayItems((prev) =>
      prev.map((it) => (it.plan_date === activeDateStr ? { ...it, is_skipped: nextSkip } : it))
    );
    if (activeDateStr === todayStr && nextSkip && autoSwitchedForDateRef.current !== todayStr) {
      autoSwitchedForDateRef.current = todayStr;
      setSelectedDayMode('tomorrow');
    }
    try {
      await api.skipDay(activeDateStr, nextSkip);
      loadDayMeals(false);
      showToast(
        nextSkip
          ? selectedDayMode === 'today'
            ? 'تم تخطي وجبات اليوم وإعادتها لرصيد الشهر'
            : 'تم تخطي وجبات غد وإعادتها لرصيد الشهر'
          : selectedDayMode === 'today'
            ? 'تم إلغاء تخطي وجبات اليوم واحتسابها من الرصيد'
            : 'تم إلغاء تخطي وجبات غد واحتسابها من الرصيد',
        'info'
      );
    } catch (err: any) {
      showAlert(
        'تنبيه: لا يمكن إلغاء تخطي اليوم',
        err.message || 'إحدى وجبات هذا اليوم استُنفد رصيدها الشهري في أيام أخرى.',
        'يرجى مراجعة رصيد استخدام الأكلات في جدول الشهر أولاً.'
      );
      loadDayMeals(false);
    }
  };

  const handleToggleSkipMeal = async (item: MealPlanItem) => {
    if (item.is_prepared) {
      showToast('يرجى التراجع عن التحضير أولاً قبل التخطي', 'warning');
      return;
    }
    const nextSkipped = !item.is_skipped;
    // Optimistic update
    setAllTwoDayItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, is_skipped: nextSkipped, is_prepared: false } : it))
    );
    try {
      await api.updateMealPlanItem(item.id, {
        ...item,
        is_prepared: false,
        is_skipped: nextSkipped,
      });
      triggerRefresh();
      loadDayMeals(false);
      showToast(
        nextSkipped
          ? 'تم تخطي الوجبة وإعادتها لرصيد الاستخدام الشهري'
          : 'تم إلغاء التخطي واحتساب الوجبة من الرصيد',
        'info'
      );
    } catch (err: any) {
      showAlert(
        'تنبيه: لا يمكن إلغاء التخطي',
        err.message || 'تم استنفاد الحد الأقصى لاختيار هذه الأكلة لهذا الشهر في أيام أخرى.',
        'لإتاحة فك التخطي، يرجى حذف الأكلة أو تخطيها من أحد الأيام الأخرى لتوفير رصيد استخدام.'
      );
      loadDayMeals(false);
    }
  };

  const handleUnprepareMeal = async (id: string) => {
    // Optimistic update
    setAllTwoDayItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, is_prepared: false } : it))
    );
    try {
      await api.unprepareMeal(id);
      triggerRefresh();
      loadDayMeals(false);
      showToast('تم التراجع عن التحضير واستعادة المكونات للمخزن', 'info');
    } catch (err: any) {
      showToast(err.message || 'فشل التراجع عن التحضير', 'error');
      loadDayMeals(false);
    }
  };

  const handleDirectPrepare = async (item: MealPlanItem) => {
    setPreparingId(item.id);
    // Optimistic update for instant UI feedback
    setAllTwoDayItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, is_prepared: true, is_skipped: false } : it))
    );
    try {
      await api.prepareMeal(item.id);
      triggerRefresh();
      loadDayMeals(false);
      showToast('تم تحضير الوجبة وخصم المواد بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل تحضير الوجبة', 'error');
      loadDayMeals(false);
    } finally {
      setPreparingId(null);
    }
  };

  const handleDeleteMeal = async (id: string) => {
    // Optimistic update
    setAllTwoDayItems((prev) => prev.filter((it) => it.id !== id));
    try {
      await api.deleteMealPlanItem(id);
      loadDayMeals(false);
    } catch (err: any) {
      loadDayMeals(false);
    }
  };

  const getSlotHint = (slot: MealSlot) => {
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

  // User Menu Actions
  const handleOpenEditName = () => {
    setEditNameInput(userName || '');
    setShowEditNameModal(true);
    setUserMenuOpen(false);
  };

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = editNameInput.trim();
    if (!trimmed) {
      showToast('يرجى كتابة الاسم', 'warning');
      return;
    }
    updateSession({
      user_name: trimmed,
      household_id: householdId,
      family_code: familyCode,
    });
    showToast('تم تعديل الاسم بنجاح', 'success');
    setShowEditNameModal(false);
  };

  const handleOpenChangeFamily = () => {
    setChangeFamilyInput('');
    setChangeFamilyError('');
    setSuggestCreateFamily(false);
    setShowChangeFamilyModal(true);
    setUserMenuOpen(false);
  };

  const submitChangeFamily = async (createNew: boolean) => {
    const code = normalizeArabicNumerals(changeFamilyInput).trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setChangeFamilyError('رمز العائلة يجب أن يتكون من 6 أرقام');
      return;
    }

    try {
      setChangeFamilyLoading(true);
      setChangeFamilyError('');

      const res = await fetch(`${api.getBaseUrl()}/session/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_name: userName,
          family_code: code,
          create_new: createNew,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل التبديل للعائلة');
      }

      if (data.suggest_create && !createNew) {
        setSuggestCreateFamily(true);
        return;
      }

      // Clear local IndexedDB tables to remove old family cache
      await clearAllLocalData();

      // Update session
      updateSession({
        user_name: data.user_name || userName,
        household_id: data.household_id,
        family_code: data.family_code,
      });

      showToast(`تم التبديل إلى العائلة بنجاح (${data.family_code})`, 'success');
      setShowChangeFamilyModal(false);
      triggerRefresh();
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (err: any) {
      setChangeFamilyError(err?.message || 'حدث خطأ أثناء التبديل');
    } finally {
      setChangeFamilyLoading(false);
    }
  };

  const handleLogout = () => {
    setUserMenuOpen(false);
    logout();
  };

  return (
    <>
      {/* Invisible Click-Outside Backdrop for Missing Ingredients Popover Bubble */}
      {activeMissingPopoverId && (
        <div
          className="fixed inset-0 z-30 bg-transparent"
          onClick={() => setActiveMissingPopoverId(null)}
        />
      )}

      {/* Invisible Click-Outside Backdrop for User Options Menu */}
      {userMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-transparent"
          onClick={() => setUserMenuOpen(false)}
        />
      )}

      <div className="space-y-4 pt-2 pb-24 max-w-2xl mx-auto">
        {/* User Greeting with Clickable Options Menu */}
        {userName && (
          <div className="px-1 pb-1 relative">
            <div className="flex items-center gap-1.5 flex-wrap text-lg font-black leading-tight">
              <span className="text-gray-900 dark:text-white">
                {greeting}،
              </span>
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-black cursor-pointer hover:underline underline-offset-4 transition-colors"
                title="انقر لخيارات الحساب والعائلة"
              >
                {userName}
              </button>
            </div>

            {/* Dropdown Menu */}
            {userMenuOpen && (
              <div
                className="absolute top-full right-1 mt-2 w-64 bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-150 dark:border-gray-800 py-2 z-50 animate-scale-up text-right overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header Info */}
                <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-850">
                  <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">حساب العائلة</p>
                  <p className="text-xs font-mono font-black text-brand-600 dark:text-brand-400 mt-0.5 tracking-wider">
                    رمز العائلة: {familyCode || 'غير محدد'}
                  </p>
                </div>

                <div className="p-1.5 space-y-1">
                  {/* Option 1: Edit Name */}
                  <button
                    type="button"
                    onClick={handleOpenEditName}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-brand-50 dark:hover:bg-brand-950/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors text-right cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-950 flex items-center justify-center text-brand-600 dark:text-brand-400">
                      <Pencil className="w-3.5 h-3.5" />
                    </div>
                    <span>تعديل الاسم</span>
                  </button>

                  {/* Option 2: Change Family */}
                  <button
                    type="button"
                    onClick={handleOpenChangeFamily}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors text-right cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <span>تغيير العائلة</span>
                  </button>

                  <div className="my-1 border-t border-gray-100 dark:border-gray-800" />

                  {/* Option 3: Logout */}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-right cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-950 flex items-center justify-center text-red-600 dark:text-red-400">
                      <LogOut className="w-3.5 h-3.5" />
                    </div>
                    <span>تسجيل الخروج</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Meals Schedule Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setSelectedDayMode((prev) => (prev === 'today' ? 'tomorrow' : 'today'))}
            className="font-bold text-gray-900 dark:text-white text-lg flex items-center gap-2 hover:text-brand-600 dark:hover:text-brand-400 active:scale-95 transition-all cursor-pointer"
            title={selectedDayMode === 'today' ? 'انقر لعرض وجبات يوم غد' : 'انقر للرجوع لوجبات اليوم'}
          >
            <span>{selectedDayMode === 'today' ? 'وجبات اليوم' : 'وجبات غد'}</span>
            <span className="text-sm font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950 px-2.5 py-0.5 rounded-full">
              {todayItems.length}
            </span>
            <ArrowLeftRight className="w-3.5 h-3.5 text-gray-400" />
          </button>

          <div className="flex items-center gap-2">
            {/* Toggle Skip Day button next to selected day's meals */}
            <button
              type="button"
              onClick={handleToggleSkipDay}
              disabled={todayItems.length === 0}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm sm:text-base font-extrabold transition-all shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${isDaySkipped
                  ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                  : 'border-gray-200 dark:border-gray-750 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
                }`}
              title={isDaySkipped ? 'إلغاء التخطي واستعادة الوجبات' : selectedDayMode === 'today' ? 'تخطي وجبات اليوم' : 'تخطي وجبات غد'}
            >
              {isDaySkipped ? (
                <>
                  <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>إلغاء التخطي</span>
                </>
              ) : (
                <>
                  <SkipForward className="w-4 h-4 text-amber-500" />
                  <span>{selectedDayMode === 'today' ? 'تخطي اليوم' : 'تخطي غد'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-gray-400">
            <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-lg font-bold">
              {selectedDayMode === 'today' ? 'جاري جلب وجبات اليوم...' : 'جاري جلب وجبات غد...'}
            </p>
          </div>
        ) : todayItems.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 text-center border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="w-16 h-16 bg-brand-50 dark:bg-brand-950/60 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-3">
              🍽️
            </div>
            <h4 className="font-bold text-gray-800 dark:text-gray-200 text-xl sm:text-2xl mb-2">
              {selectedDayMode === 'today' ? 'لا توجد وجبات مجدولة لليوم' : 'لا توجد وجبات مجدولة ليوم غد'}
            </h4>
            <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
              يمكنك تعيين وجبات هذا اليوم من خلال جدول الوجبات الشهري.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {todayItems.map((item) => {
              const recipe = item.recipe;
              const hasMissingIngredients =
                (item.total_count !== undefined &&
                  item.available_count !== undefined &&
                  item.available_count < item.total_count) ||
                (recipe?.ingredients?.some((ri) => ri.is_missing) ?? false);

              return (
                <div
                  key={item.id}
                  className={`bg-white dark:bg-gray-900 rounded-3xl border transition-all shadow-sm flex flex-col relative ${activeMissingPopoverId === item.id ? 'z-20' : 'z-0'} ${item.is_prepared
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/15 dark:bg-emerald-950/10'
                      : item.is_skipped
                        ? 'border-gray-200 dark:border-gray-800 opacity-60'
                        : 'border-gray-200 dark:border-gray-800 hover:border-brand-300 dark:hover:border-brand-700'
                    }`}
                >
                  {/* Food Photo with Overlaid Title & Hints */}
                  <div className="relative w-full aspect-[5/3] bg-gray-100 dark:bg-gray-800 rounded-t-[23px]">
                    <div className="absolute inset-0 overflow-hidden rounded-t-[23px]">
                      <img
                        src={
                          recipe?.image_url ||
                          'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600'
                        }
                        alt={recipe?.name_ar || 'وجبة'}
                        onClick={() => openSheet('recipe_detail', { recipe, mealItem: item })}
                        className="w-full h-full object-cover cursor-pointer"
                        loading="lazy"
                      />
                      {/* Dish Title Overlaid at Bottom of Image */}
                      <div
                        onClick={() => openSheet('recipe_detail', { recipe, mealItem: item })}
                        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 sm:p-5 pt-12 cursor-pointer"
                      >
                        <h4
                          className="font-black text-2xl sm:text-3xl text-white truncate drop-shadow-md hover:text-brand-300 transition-colors"
                          title={recipe?.name_ar}
                        >
                          {recipe?.name_ar || 'وجبة غير محددة'}
                        </h4>
                      </div>
                    </div>

                    {/* Meal Slot Hint in Top-Left Corner */}
                    <div className="absolute top-3 left-3 bg-black/65 backdrop-blur-md text-white px-3.5 py-1.5 rounded-xl text-sm sm:text-base font-extrabold border border-white/20 shadow-md flex items-center gap-1.5 z-10 pointer-events-none">
                      <span>{getSlotHint(item.slot)}</span>
                    </div>

                    {/* Status Badges in Top-Right Corner */}
                    <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
                      {item.is_prepared && (
                        <div className="bg-emerald-600/95 backdrop-blur-sm text-white px-3.5 py-1.5 rounded-full text-sm font-black flex items-center gap-1.5 shadow-md">
                          <CheckCircle className="w-4 h-4" />
                          <span>تم التحضير</span>
                        </div>
                      )}
                      {item.is_skipped && (
                        <div className="bg-gray-900/85 backdrop-blur-sm text-white px-3.5 py-1.5 rounded-full text-sm font-black">
                          <span>تم التخطي</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Full-bleed Card Bottom Action */}
                  {!item.is_prepared && !item.is_skipped && (
                    <button
                      type="button"
                      onClick={() => handleDirectPrepare(item)}
                      disabled={preparingId === item.id}
                      className="w-full flex items-center justify-center gap-2.5 py-4 px-4 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-base sm:text-lg font-black transition-all disabled:opacity-50 rounded-b-[23px] shadow-sm"
                    >
                      <ChefHat className={`w-5 h-5 ${preparingId === item.id ? 'animate-bounce' : ''}`} />
                      <span>{preparingId === item.id ? 'جاري التحضير...' : 'انقر لتحضير الوجبة'}</span>
                    </button>
                  )}

                  {item.is_prepared && (
                    <button
                      type="button"
                      onClick={() => handleUnprepareMeal(item.id)}
                      className="w-full py-4 px-4 bg-emerald-50 hover:bg-amber-50 dark:bg-emerald-950/40 dark:hover:bg-amber-950/40 text-emerald-800 hover:text-amber-700 dark:text-emerald-300 dark:hover:text-amber-300 text-sm sm:text-base font-black transition-all flex items-center justify-center gap-2.5 border-t border-emerald-200/60 dark:border-emerald-800/60 group rounded-b-[23px]"
                      title="اضغط للتراجع عن تحضير الوجبة واستعادة المواد للمخزون"
                    >
                      <RotateCcw className="w-5 h-5 text-emerald-600 group-hover:text-amber-600 transition-colors" />
                      <span>تراجع عن التحضير</span>
                    </button>
                  )}

                  {item.is_skipped && (
                    <div className="w-full py-3.5 px-4 bg-amber-50/90 dark:bg-amber-950/40 border-t border-amber-200/80 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-sm sm:text-base font-black flex items-center justify-between rounded-b-[23px]">
                      <span>تم تخطي هذه الوجبة لليوم</span>
                      <span className="text-xs sm:text-sm text-amber-600 dark:text-amber-400 font-bold">
                        (انقر على الصورة لإلغاء التخطي)
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>

    {/* Edit Name Modal */}
    {showEditNameModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
        <div
          className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800 text-right animate-scale-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
              <div className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-brand-950 flex items-center justify-center">
                <Pencil className="w-4 h-4" />
              </div>
              <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">
                تعديل الاسم
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setShowEditNameModal(false)}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveName} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1.5">
                اسم المستخدم الجديد
              </label>
              <input
                type="text"
                value={editNameInput}
                onChange={(e) => setEditNameInput(e.target.value)}
                placeholder="أدخل اسمك"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                autoFocus
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEditNameModal(false)}
                className="flex-1 py-2.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={!editNameInput.trim()}
                className="flex-1 py-2.5 px-3 rounded-xl bg-brand-600 hover:bg-brand-700 active:scale-95 text-white font-black text-xs shadow-md shadow-brand-600/20 disabled:opacity-50 transition-all cursor-pointer"
              >
                حفظ التعديل
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Change Family Modal */}
    {showChangeFamilyModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
        <div
          className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800 text-right animate-scale-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">
                تغيير العائلة
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setShowChangeFamilyModal(false)}
              disabled={changeFamilyLoading}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
              العائلة الحالية:{' '}
              <span className="font-mono font-black text-brand-600 dark:text-brand-400 tracking-wider">
                {familyCode || 'غير محدد'}
              </span>
            </div>

            {!suggestCreateFamily ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitChangeFamily(false);
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1.5">
                    رمز العائلة الجديدة (6 أرقام)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={changeFamilyInput}
                    onChange={(e) => {
                      setChangeFamilyInput(normalizeArabicNumerals(e.target.value).replace(/\D/g, ''));
                      setChangeFamilyError('');
                    }}
                    placeholder="000000"
                    disabled={changeFamilyLoading}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-center tracking-[0.4em] font-mono font-black text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    autoFocus
                  />
                  {changeFamilyError && (
                    <p className="text-[11px] font-bold text-red-600 dark:text-red-400 text-center mt-1.5">
                      {changeFamilyError}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowChangeFamilyModal(false)}
                    disabled={changeFamilyLoading}
                    className="flex-1 py-2.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={changeFamilyLoading || changeFamilyInput.trim().length !== 6}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {changeFamilyLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>جاري التحقق...</span>
                      </>
                    ) : (
                      <span>الانتقال للعائلة</span>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed font-bold">
                  لا توجد عائلة بهذا الرمز ({changeFamilyInput}). هل تريد إنشاء عائلة جديدة بهذا الرمز؟
                </div>

                {changeFamilyError && (
                  <p className="text-[11px] font-bold text-red-600 dark:text-red-400 text-center">
                    {changeFamilyError}
                  </p>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSuggestCreateFamily(false)}
                    disabled={changeFamilyLoading}
                    className="flex-1 py-2.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  >
                    رجوع
                  </button>
                  <button
                    type="button"
                    onClick={() => submitChangeFamily(true)}
                    disabled={changeFamilyLoading}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {changeFamilyLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>جاري الإنشاء...</span>
                      </>
                    ) : (
                      <span>إنشاء العائلة الجديدة</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </>
  );
};
