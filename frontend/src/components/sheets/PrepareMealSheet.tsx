import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { MealPlanItem } from '../../types';
import { ChefHat, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';

interface Props {
  mealItem: MealPlanItem;
  onSuccess: () => void;
}

export const PrepareMealSheet: React.FC<Props> = ({ mealItem, onSuccess }) => {
  const { showToast, closeSheet } = useApp();
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [missingItems, setMissingItems] = useState<any[] | null>(null);

  const recipe = mealItem.recipe;
  const servings = mealItem.servings;

  const handleConfirmPrepare = async () => {
    setSubmitting(true);
    setMissingItems(null);

    try {
      const res: any = await api.prepareMeal(mealItem.id, notes || undefined);
      showToast(`تم تحضير وجبة "${recipe?.name_ar}" وخصم المكونات من المخزن بنجاح!`, 'success');
      onSuccess();
      closeSheet();
    } catch (err: any) {
      if (err.data && err.data.missing_items) {
        setMissingItems(err.data.missing_items);
        showToast(err.data.message || 'المخزون غير كافٍ لتحضير الوجبة', 'error');
      } else {
        showToast(err.message || 'فشل تحضير الوجبة', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-900/50 p-4 rounded-3xl flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center flex-shrink-0">
          <ChefHat className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
            تحضير: {recipe?.name_ar}
          </h3>
          <p className="text-xs text-brand-700 dark:text-brand-300 font-medium">
            عدد الحصص: {servings} حصص • التاريخ: {mealItem.plan_date.replace(/-/g, '/')}
          </p>
        </div>
      </div>

      {/* Critical Rule Notice */}
      <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 rounded-2xl text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="block font-bold">معاملة خصم المخزون الذرية:</strong>
          سيتم التحقق من كفاية جميع المكونات وخصمها دفعة واحدة داخل معاملة بنكية آمنة، مع تسجيل حركة استهلاك لكل مكون ومنع أي تكرار.
        </div>
      </div>

      {/* If Missing Items Warning is reported by backend */}
      {missingItems && missingItems.length > 0 && (
        <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>تعذر التحضير: المواد التالية غير متوفرة بالكمية الكافية:</span>
          </div>
          <div className="space-y-1 pr-4">
            {missingItems.map((item, idx) => (
              <div key={idx} className="text-xs text-red-600 dark:text-red-400 flex justify-between">
                <span>{item.ingredient_name}:</span>
                <span className="font-bold">
                  المتوفر {item.available} {item.unit_name} (المطلوب {item.required} {item.unit_name})
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-red-500 font-medium pt-1 border-t border-red-200 dark:border-red-900/40">
            تم إيقاف المعاملة بالكامل لمنع أي خصم جزئي أو مخزون سالب.
          </p>
        </div>
      )}

      {/* Ingredients that will be deducted */}
      <div>
        <h4 className="font-extrabold text-xs text-gray-900 dark:text-white mb-2">
          المكونات التي ستُخصم من المخزن:
        </h4>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {recipe?.ingredients?.map((ri, idx) => (
            <div
              key={idx}
              className="p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-brand-600" />
                <span className="font-bold text-gray-900 dark:text-white">
                  {ri.ingredient?.name_ar}
                </span>
              </div>
              <span className="font-semibold text-gray-600 dark:text-gray-300">
                {ri.quantity * (servings / (recipe.servings || 1))} {ri.unit?.name_ar}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
          ملاحظات التحضير (اختياري)
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="مثال: تم الطبخ للغداء..."
          className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
        />
      </div>

      <div className="pt-2 flex gap-2">
        <button
          type="button"
          onClick={closeSheet}
          className="px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs rounded-2xl transition-all"
        >
          إلغاء
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={handleConfirmPrepare}
          className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-brand-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <ChefHat className="w-4 h-4" />
          {submitting ? 'جاري التحقق والخصم...' : 'تأكيد التحضير وخصم المواد'}
        </button>
      </div>
    </div>
  );
};
