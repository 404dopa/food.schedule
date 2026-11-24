import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Ingredient, IngredientGroup, Unit } from '../../types';
import { UploadCloud, Trash2 } from 'lucide-react';

interface Props {
  ingredient?: Ingredient;
  onSuccess: () => void;
}

export const AddEditIngredientSheet: React.FC<Props> = ({ ingredient, onSuccess }) => {
  const { showToast, closeSheet } = useApp();
  const [nameAr, setNameAr] = useState(ingredient?.name_ar || '');
  const [nameEn, setNameEn] = useState(ingredient?.name_en || '');
  const [imageUrl, setImageUrl] = useState(ingredient?.image_url || '');
  const [groupId, setGroupId] = useState(ingredient?.group_id || '');
  const [unitId, setUnitId] = useState(ingredient?.default_unit_id || '');
  const [unitPrice, setUnitPrice] = useState<number>(ingredient?.unit_price || 0);

  const [groups, setGroups] = useState<IngredientGroup[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([api.getIngredientGroups(), api.getUnits()]).then(([gList, uList]) => {
      setGroups(gList);
      setUnits(uList);
      if (!unitId && uList.length > 0) {
        setUnitId(uList[0].id);
      }
      if (!groupId && gList.length > 0) {
        const generalGroup = gList.find((g) => g.name_ar === 'عامة' || g.name_ar === 'عامه');
        setGroupId(generalGroup ? generalGroup.id : gList[0].id);
      }
    });
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') return;

      const img = new Image();
      img.onload = () => {
        const maxWidth = 800;
        const maxHeight = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          setImageUrl(canvas.toDataURL('image/jpeg', 0.85));
        } else {
          setImageUrl(result);
        }
      };
      img.onerror = () => {
        setImageUrl(result);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = async () => {
    if (!ingredient?.id) return;
    if (!window.confirm(`هل أنت متأكد من حذف المكون "${ingredient.name_ar}"؟`)) return;

    setSubmitting(true);
    try {
      await api.deleteIngredient(ingredient.id);
      showToast('تم حذف المكون بنجاح', 'info');
      onSuccess();
      closeSheet();
    } catch (err: any) {
      showToast(err.message || 'فشل حذف المكون', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim()) {
      showToast('يرجى إدخال اسم المكون بالعربي', 'error');
      return;
    }
    if (!unitId) {
      showToast('يرجى اختيار وحدة القياس', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (ingredient?.id) {
        await api.updateIngredient(ingredient.id, {
          name_ar: nameAr,
          name_en: nameEn,
          image_url: imageUrl,
          group_id: groupId,
          default_unit_id: unitId,
          unit_price: Number(unitPrice),
        });
        showToast('تم تحديث المكون بنجاح', 'success');
      } else {
        await api.createIngredient({
          name_ar: nameAr,
          name_en: nameEn,
          image_url: imageUrl,
          group_id: groupId,
          default_unit_id: unitId,
          unit_price: Number(unitPrice),
        });
        showToast('تمت إضافة المكون بنجاح', 'success');
      }
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
          اسم المكون (بالعربية) *
        </label>
        <input
          type="text"
          required
          value={nameAr}
          onChange={(e) => setNameAr(e.target.value)}
          placeholder="مثال: رز عنبر، لحم غنم، بصل..."
          className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
            المجموعة / التصنيف
          </label>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name_ar}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
            وحدة القياس الأساسية *
          </label>
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
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
          سعر الوحدة التقريبي (د.ع) - اختياري
        </label>
        <input
          type="number"
          min="0"
          step="50"
          value={unitPrice}
          onChange={(e) => setUnitPrice(Number(e.target.value))}
          placeholder="0"
          className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
        />
      </div>

      {/* رفع صورة المكون من الجهاز أو الهاتف */}
      <div>
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
          صورة المكون
        </label>
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-brand-500 rounded-2xl cursor-pointer bg-gray-50/70 dark:bg-gray-800/40 hover:bg-brand-50/20 transition-all overflow-hidden relative group">
          {imageUrl ? (
            <div className="relative w-full h-full">
              <img
                src={imageUrl}
                alt="معاينة صورة المكون"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-bold gap-1">
                <UploadCloud className="w-5 h-5 text-brand-300" />
                <span>انقر لتغيير الصورة</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-4 text-center">
              <div className="w-9 h-9 rounded-2xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-1.5">
                <UploadCloud className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-gray-700 dark:text-gray-200">
                انقر لاختيار أو التقاط صورة من الهاتف أو الجهاز
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                يدعم JPG، PNG، WEBP
              </p>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
        </label>
        {imageUrl && (
          <button
            type="button"
            onClick={() => setImageUrl('')}
            className="text-[11px] text-red-500 hover:text-red-700 font-bold mt-1.5 flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>إزالة الصورة</span>
          </button>
        )}
      </div>

      <div className="pt-2 space-y-2">
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-brand-600/20 transition-all disabled:opacity-50"
        >
          {submitting ? 'جاري الحفظ...' : ingredient ? 'تحديث المكون' : 'إضافة المكون للمطبخ'}
        </button>

        {ingredient && (
          <button
            type="button"
            disabled={submitting}
            onClick={handleDelete}
            className="w-full py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-bold text-xs rounded-2xl border border-red-200 dark:border-red-900/50 transition-all active:scale-98 flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>حذف هذا المكون</span>
          </button>
        )}
      </div>
    </form>
  );
};
