import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Recipe, MealSlot } from '../../types';

interface Props {
  initialDate?: string;
  initialRecipeId?: string;
  onSuccess: () => void;
}

export const AddMealSheet: React.FC<Props> = ({ initialDate, initialRecipeId, onSuccess }) => {
  const { showToast, closeSheet } = useApp();
  const [date, setDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
  const [slot, setSlot] = useState<MealSlot>('lunch');
  const [recipeId, setRecipeId] = useState(initialRecipeId || '');
  const [servings, setServings] = useState<number>(4);
  const [notes, setNotes] = useState('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getRecipes().then((list) => {
      setRecipes(list);
      if (!recipeId && list.length > 0) {
        setRecipeId(list[0].id);
        setServings(list[0].servings || 4);
      }
    });
  }, []);

  const handleRecipeChange = (id: string) => {
    setRecipeId(id);
    const selected = recipes.find((r) => r.id === id);
    if (selected && selected.servings) {
      setServings(selected.servings);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeId) {
      showToast('يرجى اختيار وصفة للوجبة', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await api.addMealPlanItem({
        plan_date: date,
        slot,
        recipe_id: recipeId,
        servings: Number(servings),
        notes,
      });

      showToast('تم حفظ وتحديث الوجبة في الجدول بنجاح', 'success');
      onSuccess();
      closeSheet();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
          تاريخ الوجبة
        </label>
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
          وقت الوجبة (الخانة)
        </label>
        <div className="grid grid-cols-4 gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl">
          {[
            { id: 'breakfast', label: 'فطور' },
            { id: 'lunch', label: 'غداء' },
            { id: 'dinner', label: 'عشاء' },
            { id: 'snack', label: 'سناك' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSlot(item.id as MealSlot)}
              className={`py-2 text-xs font-bold rounded-xl transition-all ${
                slot === item.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
          الوصفة / الأكلة
        </label>
        <select
          value={recipeId}
          onChange={(e) => handleRecipeChange(e.target.value)}
          className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
        >
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name_ar} {r.group?.name_ar ? `(${r.group.name_ar})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
          ملاحظات (اختياري)
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="مثال: غداء الضيوف، عشاء خفيف..."
          className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-brand-600/20 transition-all disabled:opacity-50"
      >
        {submitting ? 'جاري الجدولة...' : 'إضافة الوجبة للجدول'}
      </button>
    </form>
  );
};
