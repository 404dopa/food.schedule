import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { IngredientGroup, Ingredient } from '../../types';
import { Plus, Trash2, Folder, AlertCircle, CheckCircle2, Lock } from 'lucide-react';

interface Props {
  onSuccess?: () => void;
}

export const ManageIngredientGroupsSheet: React.FC<Props> = ({ onSuccess }) => {
  const { showToast, triggerRefresh } = useApp();
  const [groups, setGroups] = useState<IngredientGroup[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allGroups, allIngs] = await Promise.all([
        api.getIngredientGroups(),
        api.getIngredients(),
      ]);
      setGroups(allGroups);
      setIngredients(allIngs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute number of ingredients per group
  const getIngredientCount = (groupId: string) => {
    return ingredients.filter((ing) => ing.group_id === groupId).length;
  };

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmed = newGroupName.trim();
    if (!trimmed) {
      setErrorMsg('يرجى إدخال اسم المجموعة');
      return;
    }

    // Prevent duplicate group names
    const isDuplicate = groups.some(
      (g) => g.name_ar.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      setErrorMsg('هذه المجموعة موجودة مسبقاً، يمنع إضافة مجموعة مكررة');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await api.createIngredientGroup(trimmed);
      setGroups((prev) => [...prev, created].sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar')));
      setNewGroupName('');
      showToast('تمت إضافة مجموعة المكونات بنجاح', 'success');
      triggerRefresh();
      onSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل في إضافة المجموعة');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGroup = async (group: IngredientGroup) => {
    const count = getIngredientCount(group.id);

    // Prevent deleting group containing items
    if (count > 0) {
      showToast(`لا يمكن حذف المجموعة لأنها تحتوي على ${count} مكونات مرتبطة بها`, 'warning');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من حذف مجموعة "${group.name_ar}"؟`)) {
      return;
    }

    setDeletingId(group.id);
    try {
      await api.deleteIngredientGroup(group.id);
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      showToast('تم حذف المجموعة بنجاح', 'info');
      triggerRefresh();
      onSuccess?.();
    } catch (err: any) {
      showToast(err.message || 'فشل حذف المجموعة', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5 pb-6 text-right">
      {/* Add New Group Form */}
      <form onSubmit={handleAddGroup} className="space-y-2">
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
          إضافة مجموعة مكونات جديدة
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => {
              setNewGroupName(e.target.value);
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder="مثال: بقوليات، بهارات، خضار..."
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

      {/* List Existing Groups */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
          <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
            <span>مجموعات المكونات الحالية ({groups.length})</span>
          </h4>
          <span className="text-[11px] text-gray-400">
            لا يمكن حذف المجموعات التي تحتوي على مكونات
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-gray-400">
            جاري تحميل المجموعات...
          </div>
        ) : groups.length === 0 ? (
          <div className="py-8 text-center text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/40 rounded-2xl">
            لا توجد مجموعات مضافة حالياً.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
            {groups.map((group) => {
              const count = getIngredientCount(group.id);
              const hasIngredients = count > 0;
              const isDeleting = deletingId === group.id;

              return (
                <div
                  key={group.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-2xl transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold text-xs">
                      {group.name_ar.slice(0, 1)}
                    </div>
                    <div>
                      <h5 className="font-extrabold text-xs text-gray-900 dark:text-white">
                        {group.name_ar}
                      </h5>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                        {hasIngredients ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            <span>مرتبط بـ {count} مكونات</span>
                          </>
                        ) : (
                          <span className="text-gray-400">لا يحتوي على أي مكونات (يمكن حذفه)</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div>
                    {hasIngredients ? (
                      <div
                        className="p-2 text-gray-400 bg-gray-100 dark:bg-gray-700/50 rounded-xl cursor-not-allowed"
                        title={`يحتوي على ${count} مكونات (لا يمكن الحذف)`}
                      >
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(group)}
                        disabled={isDeleting}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-all active:scale-95 disabled:opacity-40"
                        title="حذف هذه المجموعة"
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
