import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Recipe, MealPlanItem } from '../../types';
import { formatQty } from '../../utils/format';
import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  ChevronRight,
  ChefHat,
  UtensilsCrossed,
  SkipForward,
  RotateCcw,
  Edit2,
  Trash2,
} from 'lucide-react';

interface Props {
  recipe: Recipe;
  mealItem?: MealPlanItem;
  onSuccess?: () => void;
}

export const RecipeDetailSheet: React.FC<Props> = ({ recipe, mealItem, onSuccess }) => {
  const { closeSheet, openSheet, showToast, triggerRefresh } = useApp();
  const [view, setView] = useState<'main' | 'instructions'>('main');
  const [isSkipped, setIsSkipped] = useState(!!mealItem?.is_skipped);
  const [isPrepared, setIsPrepared] = useState(!!mealItem?.is_prepared);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const isMutating = isPreparing || isSkipping;

  const mainRef = useRef<HTMLDivElement>(null);
  const [contentMinHeight, setContentMinHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (view === 'main' && mainRef.current) {
      const h = mainRef.current.offsetHeight;
      if (h > 0) {
        setContentMinHeight(h);
      }
    }
  }, [view]);

  useEffect(() => {
    if (mealItem) {
      setIsSkipped(!!mealItem.is_skipped);
      setIsPrepared(!!mealItem.is_prepared);
    }
  }, [mealItem?.is_skipped, mealItem?.is_prepared]);

  const handleDeleteRecipe = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف وصفة "${recipe.name_ar}"؟\nسيتم إلغاؤها من كافة أيام الجدول تلقائياً.`)) return;
    try {
      await api.deleteRecipe(recipe.id);
      showToast('تم حذف الوصفة وإلغاؤها من كافة أيام الجدول تلقائياً', 'info');
      closeSheet();
      triggerRefresh();
      onSuccess?.();
    } catch (err: any) {
      showToast(err.message || 'فشل حذف الوصفة', 'error');
    }
  };

  const notifyMealUpdated = (is_prepared: boolean, is_skipped: boolean) => {
    if (!mealItem) return;
    window.dispatchEvent(
      new CustomEvent('bayti:meal-updated', {
        detail: { id: mealItem.id, is_prepared, is_skipped },
      })
    );
  };

  const handleToggleSkipMeal = async () => {
    if (!mealItem || isMutating) return;
    if (isPrepared) {
      showToast('يرجى التراجع عن التحضير أولاً قبل التخطي', 'warning');
      return;
    }
    const nextSkipped = !isSkipped;
    setIsSkipping(true);
    setIsSkipped(nextSkipped);
    mealItem.is_skipped = nextSkipped;
    mealItem.is_prepared = false;
    notifyMealUpdated(false, nextSkipped);
    try {
      await api.updateMealPlanItem(mealItem.id, {
        ...mealItem,
        is_prepared: false,
        is_skipped: nextSkipped,
      });
      triggerRefresh();
    } catch (err: any) {
      setIsSkipped(!nextSkipped);
      mealItem.is_skipped = !nextSkipped;
      notifyMealUpdated(false, !nextSkipped);
      showToast(err.message || 'فشل تغيير حالة التخطي', 'error');
    } finally {
      setIsSkipping(false);
    }
  };

  const handlePrepareMeal = async () => {
    if (!mealItem || isMutating) return;
    // Optimistic update for instant response
    setIsPrepared(true);
    setIsSkipped(false);
    mealItem.is_prepared = true;
    mealItem.is_skipped = false;
    notifyMealUpdated(true, false);
    setIsPreparing(true);
    try {
      await api.prepareMeal(mealItem.id);
      showToast(`تم تحضير وجبة "${recipe.name_ar}" وخصم المواد بنجاح`, 'success');
      triggerRefresh();
    } catch (err: any) {
      setIsPrepared(false);
      mealItem.is_prepared = false;
      notifyMealUpdated(false, false);
      showToast(err.message || 'فشل تحضير الوجبة', 'error');
    } finally {
      setIsPreparing(false);
    }
  };

  const handleUnprepareMeal = async () => {
    if (!mealItem || isMutating) return;
    // Optimistic update for instant response
    setIsPrepared(false);
    mealItem.is_prepared = false;
    notifyMealUpdated(false, false);
    setIsPreparing(true);
    try {
      await api.unprepareMeal(mealItem.id);
      showToast(`تم التراجع عن تحضير "${recipe.name_ar}" واستعادة المواد بنجاح`, 'info');
      triggerRefresh();
    } catch (err: any) {
      setIsPrepared(true);
      mealItem.is_prepared = true;
      notifyMealUpdated(true, false);
      showToast(err.message || 'فشل التراجع عن التحضير', 'error');
    } finally {
      setIsPreparing(false);
    }
  };

  // Secondary View: Ingredients & Instructions
  if (view === 'instructions') {
    return (
      <div
        style={{ minHeight: contentMinHeight ? `${contentMinHeight}px` : undefined }}
        className="space-y-4 pb-2 animate-fade-in"
      >
        {/* Back Button Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setView('main')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold transition-all active:scale-95"
          >
            <ChevronRight className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <span>رجوع لتفاصيل الأكلة</span>
          </button>

          <span className="text-xs font-extrabold text-brand-600 dark:text-brand-400 flex items-center gap-1">
            <UtensilsCrossed className="w-3.5 h-3.5" />
            المقادير والتحضير
          </span>
        </div>

        {/* Ingredients Section */}
        <div>
          <h4 className="font-extrabold text-xs text-gray-900 dark:text-white mb-2.5 flex items-center gap-1.5">
            <span>المقادير وموقف المخزن</span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400">
              {recipe.ingredients?.length || 0} مواد
            </span>
          </h4>

          {recipe.ingredients && recipe.ingredients.length > 0 ? (
            <div className="space-y-1.5">
              {recipe.ingredients.map((ri, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 flex items-center justify-between text-xs transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div>
                      <span className="font-extrabold text-gray-900 dark:text-gray-100 text-xs sm:text-sm block">
                        {ri.ingredient?.name_ar || 'مكون'}
                      </span>
                      {ri.ingredient?.group?.name_ar && (
                        <span className="text-gray-400 text-[11px] block">
                          {ri.ingredient.group.name_ar}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-left font-black text-xs text-brand-700 dark:text-brand-300 bg-white dark:bg-gray-900 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700">
                    {formatQty(ri.quantity)} {ri.unit?.name_ar}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 text-center text-xs text-gray-400">
              لا توجد مقادير مسجلة لهذه الوصفة
            </div>
          )}
        </div>

        {/* Instructions Section */}
        <div className="pt-2">
          <h4 className="font-extrabold text-xs text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
            <ChefHat className="w-3.5 h-3.5 text-amber-500" />
            <span>طريقة التحضير</span>
          </h4>

          {recipe.instructions ? (
            <div className="p-3.5 bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 rounded-2xl text-xs text-gray-800 dark:text-gray-200 whitespace-pre-line leading-relaxed">
              {recipe.instructions}
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 text-center text-xs text-gray-400">
              لا توجد خطوات تحضير مسجلة لهذه الوصفة
            </div>
          )}
        </div>
      </div>
    );
  }

  // Primary View: Recipe Main Details
  return (
    <div ref={mainRef} className="space-y-4 animate-fade-in">
      {/* Photo and Header Badges */}
      <div className="relative rounded-3xl overflow-hidden h-48 bg-gray-100 dark:bg-gray-800 shadow-sm">
        <img
          src={
            recipe.image_url ||
            'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600'
          }
          alt={recipe.name_ar}
          className="w-full h-full object-cover"
        />

        {/* Floating "!" Button for Quick Access to Ingredients & Instructions */}
        <button
          type="button"
          onClick={() => setView('instructions')}
          className="absolute top-3 left-3 w-9 h-9 rounded-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-md text-brand-600 dark:text-brand-400 font-black text-base flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all border border-brand-200 dark:border-brand-800"
          title="المقادير وطريقة التحضير (!)"
        >
          !
        </button>

        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent flex items-end p-4 pointer-events-none">
          <div>
            <span className="text-xs font-bold text-brand-300">
              {recipe.group?.name_ar || 'أكلات عامة'}
            </span>
            <h2 className="text-xl font-black text-white leading-tight mt-0.5">
              {recipe.name_ar}
            </h2>
          </div>
        </div>
      </div>

      {/* Meta Cost */}
      {recipe.total_cost ? (
        <div className="flex items-center justify-between p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 text-xs">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="font-bold text-gray-700 dark:text-gray-300">التكلفة التقديرية</span>
          </div>
          <span className="font-black text-emerald-700 dark:text-emerald-300">
            {(recipe.total_cost || 0).toLocaleString('ar-IQ')} د.ع
          </span>
        </div>
      ) : null}

      {/* Recipe Description (if exists) */}
      {recipe.description && (
        <div className="p-3 bg-gray-50/80 dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-gray-800 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
          {recipe.description}
        </div>
      )}

      {/* Recipe Actions & Ingredients Button: Only shown in Recipes Tab (not from Home) */}
      {!mealItem && (
        <>
          {/* View Ingredients & Instructions Button */}
          <button
            type="button"
            onClick={() => setView('instructions')}
            className="w-full py-3 px-4 bg-brand-50/80 hover:bg-brand-100 dark:bg-brand-950/40 dark:hover:bg-brand-900/40 border border-brand-200/70 dark:border-brand-800/60 rounded-2xl flex items-center justify-between text-xs font-bold text-brand-700 dark:text-brand-300 transition-all active:scale-98 shadow-xs"
          >
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span>عرض المقادير وخطوات التحضير ({recipe.ingredients?.length || 0} مواد)</span>
            </div>
            <ChevronRight className="w-4 h-4 rotate-180 text-brand-500" />
          </button>

          {/* Recipe Actions: Edit & Delete */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => openSheet('edit_recipe', recipe)}
              className="flex-1 py-3 px-3 rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-800 dark:text-gray-200 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-700 shadow-xs"
            >
              <Edit2 className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span>تعديل الوصفة</span>
            </button>

            <button
              type="button"
              onClick={handleDeleteRecipe}
              className="py-3 px-4 rounded-2xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 border border-red-200/80 dark:border-red-900/50 shadow-xs"
              title="حذف هذه الوصفة"
            >
              <Trash2 className="w-4 h-4" />
              <span>حذف</span>
            </button>
          </div>
        </>
      )}

      {/* Special Actions for Home Tab (Scheduled Meal Operations) */}
      {mealItem && (
        <div className="space-y-2.5 pt-3 border-t border-gray-100 dark:border-gray-800">
          {/* Skip Day/Meal Button (Only when not prepared) */}
          {!isPrepared && (
            <button
              type="button"
              onClick={handleToggleSkipMeal}
              disabled={isMutating}
              className={`w-full py-3 px-3 rounded-2xl border transition-all active:scale-95 flex items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-50 ${
                isSkipped
                  ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/60 text-amber-700 dark:text-amber-300'
                  : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 border-gray-200 dark:border-gray-750 text-gray-700 dark:text-gray-200'
              }`}
            >
              {isSkipped ? (
                <>
                  <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>إلغاء تخطي الوجبة</span>
                </>
              ) : (
                <>
                  <SkipForward className="w-4 h-4 text-amber-500" />
                  <span>تخطي الوجبة اليوم</span>
                </>
              )}
            </button>
          )}

          {/* Long Button Below the Two Buttons: Prepare / Unprepare */}
          {!isPrepared ? (
            <button
              type="button"
              onClick={handlePrepareMeal}
              disabled={isMutating || isSkipped}
              className="w-full py-3.5 px-4 bg-brand-600 hover:bg-brand-700 active:scale-95 text-white text-sm font-extrabold rounded-2xl shadow-md shadow-brand-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <ChefHat className={`w-4 h-4 ${isPreparing ? 'animate-bounce' : ''}`} />
              <span>{isPreparing ? 'جاري التحضير...' : 'تم تحضير الوجبة'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleUnprepareMeal}
              disabled={isMutating}
              className="w-full py-3.5 px-4 rounded-2xl border border-emerald-300 dark:border-emerald-700/60 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              title="اضغط للتراجع عن تحضير الوجبة واستعادة المواد للمخزون"
            >
              <RotateCcw className="w-4 h-4 text-emerald-600 dark:text-emerald-400 transition-colors" />
              <span>{isPreparing ? 'جاري التراجع...' : 'تراجع عن التحضير'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
