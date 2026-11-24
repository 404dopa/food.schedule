import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Ingredient, Unit } from '../../types';

interface Props {
  listId?: string;
  onSuccess: () => void;
}

export const AddShoppingItemSheet: React.FC<Props> = ({ listId, onSuccess }) => {
  const { showToast, closeSheet } = useApp();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [selectedIngId, setSelectedIngId] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitId, setUnitId] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState<number>(0);
  const [units, setUnits] = useState<Unit[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([api.getIngredients(), api.getUnits()]).then(([ingList, uList]) => {
      setIngredients(ingList);
      setUnits(uList);
      if (ingList.length > 0) {
        setSelectedIngId(ingList[0].id);
        setUnitId(ingList[0].default_unit_id);
        setEstimatedPrice(ingList[0].unit_price);
      }
    });
  }, []);

  const handleIngChange = (id: string) => {
    setSelectedIngId(id);
    const ing = ingredients.find((i) => i.id === id);
    if (ing) {
      setUnitId(ing.default_unit_id);
      setEstimatedPrice(ing.unit_price * quantity);
    }
  };

  const handleQtyChange = (qty: number) => {
    setQuantity(qty);
    const ing = ingredients.find((i) => i.id === selectedIngId);
    if (ing) {
      setEstimatedPrice(ing.unit_price * qty);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIngId) {
      showToast('يرجى اختيار مادة', 'error');
      return;
    }

    setSubmitting(true);
    try {
      let targetListId = listId;
      if (!targetListId) {
        const activeList = await api.getActiveShoppingList();
        targetListId = activeList.id;
      }

      await api.addShoppingItem({
        shopping_list_id: targetListId,
        ingredient_id: selectedIngId,
        required_quantity: Number(quantity),
        unit_id: unitId,
        estimated_price: Number(estimatedPrice),
        actual_price: Number(estimatedPrice),
      });

      showToast('تمت إضافة المادة إلى قائمة التسوق', 'success');
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
          اختر المادة المراد شراؤها
        </label>
        <select
          value={selectedIngId}
          onChange={(e) => handleIngChange(e.target.value)}
          className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
        >
          {ingredients.map((ing) => (
            <option key={ing.id} value={ing.id}>
              {ing.name_ar} ({ing.group?.name_ar || 'عام'})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
            الكمية المطلوبة
          </label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            required
            value={quantity}
            onChange={(e) => handleQtyChange(Number(e.target.value))}
            className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
            وحدة القياس
          </label>
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name_ar} ({u.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
          السعر التقديري (د.ع)
        </label>
        <input
          type="number"
          min="0"
          value={estimatedPrice}
          onChange={(e) => setEstimatedPrice(Number(e.target.value))}
          className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-brand-600/20 transition-all disabled:opacity-50"
      >
        {submitting ? 'جاري الإضافة...' : 'إضافة إلى القائمة'}
      </button>
    </form>
  );
};
