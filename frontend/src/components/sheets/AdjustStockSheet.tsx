import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Ingredient } from '../../types';
import { Plus, Minus, ArrowUpDown } from 'lucide-react';

interface Props {
  ingredient: Ingredient;
  onSuccess: () => void;
}

export const AdjustStockSheet: React.FC<Props> = ({ ingredient, onSuccess }) => {
  const { showToast, closeSheet } = useApp();
  const [delta, setDelta] = useState<number>(1);
  const [direction, setDirection] = useState<'add' | 'subtract'>('add');
  const [type, setType] = useState<'adjustment' | 'purchase' | 'waste' | 'consumption'>('adjustment');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const currentQty = ingredient.inventory?.quantity ?? 0;
  const unitName = ingredient.default_unit?.name_ar || 'وحدة';

  const newProjectedQty =
    direction === 'add' ? currentQty + delta : currentQty - delta;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (delta <= 0) {
      showToast('يرجى تحديد كمية صحيحة أكبر من الصفر', 'error');
      return;
    }
    if (direction === 'subtract' && newProjectedQty < 0) {
      showToast('لا يمكن أن يصبح المخزون سالباً', 'error');
      return;
    }

    setSubmitting(true);
    const quantityToSend = direction === 'add' ? delta : -delta;

    try {
      await api.adjustInventory({
        ingredient_id: ingredient.id,
        quantity: quantityToSend,
        unit_id: ingredient.default_unit_id,
        type: type,
        notes: notes || undefined,
        unit_price: ingredient.unit_price,
      });

      showToast('تم تحديث مخزون المكون بنجاح', 'success');
      onSuccess();
      closeSheet();
    } catch (err: any) {
      showToast(err.message || 'فشل تعديل المخزون', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Current Info */}
      <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl flex items-center justify-between">
        <div>
          <h4 className="font-bold text-sm text-gray-900 dark:text-white">{ingredient.name_ar}</h4>
          <span className="text-xs text-gray-400">الكمية الحالية في المخزن</span>
        </div>
        <div className="text-left font-extrabold text-base text-brand-600 dark:text-brand-400">
          {currentQty} {unitName}
        </div>
      </div>

      {/* Direction toggle */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl">
        <button
          type="button"
          onClick={() => setDirection('add')}
          className={`py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            direction === 'add'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Plus className="w-4 h-4" />
          إضافة للمخزون (+)
        </button>
        <button
          type="button"
          onClick={() => setDirection('subtract')}
          className={`py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            direction === 'subtract'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Minus className="w-4 h-4" />
          خصم من المخزون (-)
        </button>
      </div>

      {/* Quantity input & quick buttons */}
      <div>
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
          الكمية المراد {direction === 'add' ? 'إضافتها' : 'خصمها'} ({unitName})
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.1"
            min="0.1"
            required
            value={delta}
            onChange={(e) => setDelta(Number(e.target.value))}
            className="flex-1 px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>

        {/* Quick Steppers */}
        <div className="flex gap-1.5 mt-2">
          {[0.5, 1, 2, 5].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => setDelta(val)}
              className="flex-1 py-1 text-xs font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-gray-700 dark:text-gray-300"
            >
              +{val}
            </button>
          ))}
        </div>
      </div>

      {/* Reason */}
      <div>
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
          سبب الحركة
        </label>
        <select
          value={type}
          onChange={(e: any) => setType(e.target.value)}
          className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
        >
          <option value="purchase">شراء ومؤونة جديدة</option>
          <option value="adjustment">جرد وتصحيح يدوي</option>
          <option value="consumption">استهلاك واستخدام</option>
          <option value="waste">تالف أو منتهي الصلاحية</option>
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
          placeholder="مثال: شراء من السوق المحلي..."
          className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
        />
      </div>

      {/* Projected Result */}
      <div className="p-3 bg-brand-50 dark:bg-brand-950/40 rounded-2xl text-xs flex justify-between font-bold text-brand-800 dark:text-brand-300">
        <span>الكمية الجديدة بعد التعديل:</span>
        <span>
          {newProjectedQty} {unitName}
        </span>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-brand-600/20 transition-all disabled:opacity-50"
      >
        {submitting ? 'جاري التنفيذ...' : 'تأكيد التعديل'}
      </button>
    </form>
  );
};
