import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Sparkles } from 'lucide-react';

interface Props {
  onSuccess: () => void;
}

export const SmartShoppingSheet: React.FC<Props> = ({ onSuccess }) => {
  const { showToast, closeSheet, setCurrentTab } = useApp();
  const today = new Date();
  const [startDate, setStartDate] = useState(today.toISOString().split('T')[0]);

  const defaultEnd = new Date(today);
  defaultEnd.setDate(today.getDate() + 7);
  const [endDate, setEndDate] = useState(defaultEnd.toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const list = await api.generateSmartShoppingList(startDate, endDate);
      showToast(`تم إنشاء قائمة التسوق بنجاح! تضم ${list.items.length} مادة مطلوبة`, 'success');
      onSuccess();
      closeSheet();
      setCurrentTab('shopping');
    } catch (err: any) {
      showToast(err.message || 'فشل توليد قائمة التسوق', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleGenerate} className="space-y-4">
      <div className="bg-brand-50 dark:bg-brand-950/40 p-4 rounded-3xl border border-brand-200 dark:border-brand-900/50 flex items-start gap-3">
        <Sparkles className="w-6 h-6 text-brand-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-brand-800 dark:text-brand-300">
          <strong className="block font-bold mb-0.5">معادلة الحساب الذكية:</strong>
          ستقوم المنظومة بمسح كافة الوجبات المجدولة في الفترة المختارة، وحساب مجموع المقادير المطلوبة، ثم طرح الكميات المتوفرة فعلياً في المخزن، لتنتج قائمة بالنواقص الدقيقة المطلوب شراؤها.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
            من تاريخ
          </label>
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
            إلى تاريخ
          </label>
          <input
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-gradient-to-r from-brand-600 to-emerald-600 hover:from-brand-700 hover:to-emerald-700 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-brand-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Sparkles className="w-4 h-4" />
        {submitting ? 'جاري الفحص والتحليل...' : 'توليد القائمة الذكية'}
      </button>
    </form>
  );
};
