import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { ShoppingItem } from '../../types';
import { ShoppingCart, Check } from 'lucide-react';

interface Props {
  item: ShoppingItem;
  onSuccess: () => void;
}

export const BuyShoppingItemSheet: React.FC<Props> = ({ item, onSuccess }) => {
  const { showToast, closeSheet } = useApp();
  const [boughtQty, setBoughtQty] = useState<number>(item.required_quantity ?? item.requiredQuantity ?? 1);
  const [actualPrice, setActualPrice] = useState<number>(item.estimated_price ?? item.estimatedPrice ?? 0);
  const [addToInventory, setAddToInventory] = useState<boolean>(true);
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ing = item.ingredient;
  const unitName = item.unit?.name_ar || ing?.default_unit?.name_ar || 'وحدة';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (boughtQty <= 0) {
      showToast('يرجى إدخال كمية صحيحة', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await api.markShoppingItemBought({
        shopping_item_id: item.id,
        bought_quantity: Number(boughtQty),
        actual_price: Number(actualPrice),
        add_to_inventory: addToInventory,
        vendor: vendor || undefined,
        notes: notes || undefined,
      });

      showToast(
        addToInventory
          ? `تم تسجيل الشراء وإضافة ${boughtQty} ${unitName} لمخزن المطبخ!`
          : 'تم تسجيل الشراء بنجاح',
        'success'
      );
      onSuccess();
      closeSheet();
    } catch (err: any) {
      showToast(err.message || 'فشل تسجيل الشراء', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 p-4 rounded-3xl flex items-center justify-between">
        <div>
          <h3 className="font-extrabold text-sm text-gray-900 dark:text-white">
            {ing?.name_ar || 'مادة التسوق'}
          </h3>
          <span className="text-xs text-emerald-700 dark:text-emerald-300">
            الكمية المطلوبة بالقائمة: {item.requiredQuantity} {unitName}
          </span>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center">
          <ShoppingCart className="w-5 h-5" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
            الكمية المشتراة فعلياً ({unitName}) *
          </label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            required
            value={boughtQty}
            onChange={(e) => setBoughtQty(Number(e.target.value))}
            className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
            السعر الفعلي المدفوع (د.ع) *
          </label>
          <input
            type="number"
            min="0"
            step="250"
            required
            value={actualPrice}
            onChange={(e) => setActualPrice(Number(e.target.value))}
            className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Auto add to inventory toggle */}
      <label className="flex items-center gap-3 p-3.5 bg-gray-50 dark:bg-gray-800/60 rounded-2xl cursor-pointer">
        <input
          type="checkbox"
          checked={addToInventory}
          onChange={(e) => setAddToInventory(e.target.checked)}
          className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
        />
        <div className="text-xs">
          <span className="font-bold text-gray-900 dark:text-white block">
            إضافة هذه الكمية تلقائياً لمخزون المطبخ
          </span>
          <span className="text-gray-400 text-[11px]">
            يقوم بتحديث الرصيد وتسجيل حركة شراء في سجل المعاملات فورياً.
          </span>
        </div>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
            اسم المحل / المتجر (اختياري)
          </label>
          <input
            type="text"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="مثال: أسواق النور..."
            className="w-full px-3.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
            ملاحظات (اختياري)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-brand-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        <Check className="w-4 h-4" />
        {submitting ? 'جاري الحفظ...' : 'تأكيد الشراء وإغلاق البند'}
      </button>
    </form>
  );
};
