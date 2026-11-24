import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { RecipeGroup, Recipe } from '../../types';
import { Plus, Trash2, Folder, AlertCircle, CheckCircle2, Lock } from 'lucide-react';

interface Props {
  onSuccess?: () => void;
}

export const ManageRecipeGroupsSheet: React.FC<Props> = ({ onSuccess }) => {
  const { showToast, triggerRefresh } = useApp();
  const [groups, setGroups] = useState<RecipeGroup[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allGroups, allRecipes] = await Promise.all([
        api.getRecipeGroups(),
        api.getRecipes(),
      ]);
      setGroups(allGroups);
      setRecipes(allRecipes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute number of recipes per group
  const getRecipeCount = (groupId: string) => {
    return recipes.filter((r) => r.group_id === groupId).length;
  };

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmed = newGroupName.trim();
    if (!trimmed) {
      setErrorMsg('يرجى إدخال اسم التصنيف');
      return;
    }

    // Condition: يمنع اضافة تصنيف مكرر
    const isDuplicate = groups.some(
      (g) => g.name_ar.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      setErrorMsg('هذا التصنيف موجود مسبقاً، يمنع إضافة تصنيف مكرر');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await api.createRecipeGroup(trimmed);
      setGroups((prev) => [...prev, created].sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar')));
      setNewGroupName('');
      showToast('تمت إضافة التصنيف بنجاح', 'success');
      triggerRefresh();
      onSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل في إضافة التصنيف');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGroup = async (group: RecipeGroup) => {
    const count = getRecipeCount(group.id);

    // Condition: يمنع حذف تصنيف يحتوي ايتمات
    if (count > 0) {
      showToast(`لا يمكن حذف التصنيف لأنه يحتوي على ${count} أكلات مرتبطة به`, 'warning');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من حذف تصنيف "${group.name_ar}"؟`)) {
      return;
    }

    setDeletingId(group.id);
    try {
      await api.deleteRecipeGroup(group.id);
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      showToast('تم حذف التصنيف بنجاح', 'info');
      triggerRefresh();
      onSuccess?.();
    } catch (err: any) {
      showToast(err.message || 'فشل حذف التصنيف', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5 pb-6 text-right">
      {/* Add New Category Form */}
      <form onSubmit={handleAddGroup} className="space-y-2">
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
          إضافة تصنيف جديد
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => {
              setNewGroupName(e.target.value);
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder="مثال: أكلات بحرية، مقبلات..."
            className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
            disabled={isSubmitting}
          />
          <button
            type="submit"
            disabled={isSubmitting || !newGroupName.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 active:scale-95 text-white text-xs font-bold rounded-2xl shadow-md shadow-brand-600/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة</span>
          </button>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-semibold px-1 pt-1">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </form>

      {/* Rules Notice */}
      <div className="p-3 bg-brand-50/60 dark:bg-brand-950/30 rounded-2xl border border-brand-100 dark:border-brand-900/40 text-[11px] text-brand-800 dark:text-brand-300 space-y-1">
        <div className="flex items-center gap-1.5 font-bold">
          <CheckCircle2 className="w-3.5 h-3.5 text-brand-600" />
          <span>شروط التصنيفات:</span>
        </div>
        <p className="text-gray-600 dark:text-gray-400 pr-5">
          • يمنع إضافة تصنيف بنفس اسم تصنيف موجود مسبقاً.
          <br />
          • يمنع حذف أي تصنيف يحتوي على أكلات حتى يتم نقلها أو حذفها أولاً.
        </p>
      </div>

      {/* Categories List */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 px-1">
          التصنيفات الحالية ({groups.length})
        </h4>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-8 text-gray-400">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-xs">جاري جلب التصنيفات...</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="p-6 bg-gray-50 dark:bg-gray-800/40 rounded-2xl text-center text-xs text-gray-400">
            لا توجد تصنيفات مضافة حتى الآن
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
            {groups.map((group) => {
              const count = getRecipeCount(group.id);
              const hasRecipes = count > 0;

              return (
                <div
                  key={group.id}
                  className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-brand-950 flex items-center justify-center text-brand-600 dark:text-brand-400 flex-shrink-0">
                      <Folder className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-xs text-gray-900 dark:text-gray-100 block truncate">
                        {group.name_ar}
                      </span>
                      <span className="text-[11px] text-gray-400 block">
                        {count === 0 ? 'لا توجد أكلات' : `${count} أكلات`}
                      </span>
                    </div>
                  </div>

                  {/* Delete Button */}
                  <div className="flex items-center gap-1">
                    {hasRecipes ? (
                      <div
                        className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-xl text-[10px] font-bold cursor-not-allowed select-none"
                        title="يمنع حذف هذا التصنيف لأنه يحتوي على أكلات"
                      >
                        <Lock className="w-3 h-3 text-amber-500" />
                        <span>يحتوي أكلات</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(group)}
                        disabled={deletingId === group.id}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                        title="حذف التصنيف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
