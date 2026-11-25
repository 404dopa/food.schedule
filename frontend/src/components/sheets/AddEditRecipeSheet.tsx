import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Recipe, RecipeGroup, Ingredient, Unit, RecipeIngredient } from '../../types';
import { normalizeArabicNumerals } from '../../utils/format';
import { Plus, Trash2, ChevronRight, UploadCloud, UtensilsCrossed, Check } from 'lucide-react';

interface Props {
  recipe?: Recipe;
  onSuccess: () => void;
}

export const AddEditRecipeSheet: React.FC<Props> = ({ recipe, onSuccess }) => {
  const { showToast, closeSheet, openSheet } = useApp();
  const [nameAr, setNameAr] = useState(recipe?.name_ar || '');
  const [nameEn, setNameEn] = useState(recipe?.name_en || '');
  const [groupId, setGroupId] = useState(recipe?.group_id || '');
  const [imageUrl, setImageUrl] = useState(recipe?.image_url || '');
  const [description, setDescription] = useState(recipe?.description || '');
  const [instructions, setInstructions] = useState(recipe?.instructions || '');
  const [servings, setServings] = useState<string>(
    recipe?.servings !== undefined ? String(recipe.servings) : ''
  );
  const [forBreakfast, setForBreakfast] = useState<boolean>(!!recipe?.for_breakfast);
  const [forLunch, setForLunch] = useState<boolean>(!!recipe?.for_lunch);
  const [forDinner, setForDinner] = useState<boolean>(!!recipe?.for_dinner);
  const [forSnack, setForSnack] = useState<boolean>(!!recipe?.for_snack);
  const [view, setView] = useState<'main' | 'ingredients_instructions'>('main');

  const mainRef = useRef<HTMLFormElement>(null);
  const [contentMinHeight, setContentMinHeight] = useState<number | undefined>(undefined);

  const [ingredientsList, setIngredientsList] = useState<RecipeIngredient[]>(
    recipe?.ingredients || []
  );

  const [groups, setGroups] = useState<RecipeGroup[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Measure main view height so ingredients view matches it seamlessly
  useEffect(() => {
    if (view === 'main' && mainRef.current) {
      const h = mainRef.current.offsetHeight;
      if (h > 0) {
        setContentMinHeight(h);
      }
    }
  }, [view, imageUrl, ingredientsList.length]);

  useEffect(() => {
    Promise.all([
      api.getRecipeGroups(),
      api.getIngredients(),
      api.getUnits(),
    ]).then(([gList, ingList, uList]) => {
      setGroups(gList);
      setAllIngredients(ingList);
      setUnits(uList);
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

  const addIngredientRow = () => {
    if (allIngredients.length === 0) return;
    const defaultIng = allIngredients[0];
    setIngredientsList((prev) => [
      ...prev,
      {
        ingredient_id: defaultIng.id,
        quantity: 1,
        unit_id: defaultIng.default_unit_id,
        notes: '',
      },
    ]);
  };

  const removeIngredientRow = (index: number) => {
    setIngredientsList((prev) => prev.filter((_, i) => i !== index));
  };

  const updateIngredientRow = (index: number, field: keyof RecipeIngredient, value: any) => {
    setIngredientsList((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      // If ingredient changed, auto-set default unit
      if (field === 'ingredient_id') {
        const selected = allIngredients.find((i) => i.id === value);
        if (selected) {
          updated[index].unit_id = selected.default_unit_id;
        }
      }
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim()) {
      showToast('يرجى إدخال اسم الوصفة', 'error');
      return;
    }

    setSubmitting(true);
    const payload: Partial<Recipe> = {
      name_ar: nameAr,
      name_en: nameEn,
      group_id: groupId,
      image_url: imageUrl,
      description,
      instructions,
      servings: servings === '' ? 0 : Math.max(0, Math.min(31, Number(servings))),
      prep_time_min: 30,
      cook_time_min: 30,
      for_breakfast: forBreakfast,
      for_lunch: forLunch,
      for_dinner: forDinner,
      for_snack: forSnack,
      ingredients: ingredientsList.map((ri) => ({
        ingredient_id: ri.ingredient_id,
        quantity: Number(ri.quantity),
        unit_id: ri.unit_id,
        notes: ri.notes || '',
      })),
    };

    try {
      if (recipe?.id) {
        await api.updateRecipe(recipe.id, payload);
        showToast('تم تحديث الوصفة بنجاح', 'success');
      } else {
        await api.createRecipe(payload);
        showToast('تم إنشاء الوصفة بنجاح', 'success');
      }
      onSuccess();
      closeSheet();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (recipe) {
      openSheet('recipe_detail', recipe);
    } else {
      closeSheet();
    }
  };

  // View 2: Ingredients & Instructions
  if (view === 'ingredients_instructions') {
    return (
      <div
        style={{ minHeight: contentMinHeight ? `${contentMinHeight}px` : undefined }}
        className="space-y-4 pb-2 animate-fade-in flex flex-col justify-between"
      >
        <div className="space-y-4">
          {/* Back Button Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setView('main')}
              className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs sm:text-sm font-bold transition-all active:scale-95"
            >
              <ChevronRight className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span>رجوع لبيانات الوصفة</span>
            </button>

            <span className="text-xs font-extrabold text-brand-600 dark:text-brand-400 flex items-center gap-1">
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>المقادير وطريقة التحضير</span>
            </span>
          </div>

          {/* Ingredients Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                قائمة مقادير المكونات ({ingredientsList.length})
              </label>
              <button
                type="button"
                onClick={addIngredientRow}
                className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-brand-600 dark:text-brand-400 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950 px-4 py-2.5 min-h-[44px] rounded-2xl border border-brand-200/70 dark:border-brand-800/60 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة مكون</span>
              </button>
            </div>

            {ingredientsList.length === 0 ? (
              <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl text-center text-xs text-gray-400">
                لم تتم إضافة أي مقادير بعد. اضغط "إضافة مكون" لإدخال المقادير المطلوبة.
              </div>
            ) : (
              <div className="space-y-2 pl-1">
                {ingredientsList.map((ri, index) => (
                  <div
                    key={index}
                    className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <select
                        value={ri.ingredient_id}
                        onChange={(e) => updateIngredientRow(index, 'ingredient_id', e.target.value)}
                        className="flex-1 px-3 py-2.5 min-h-[42px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs sm:text-sm focus:outline-none"
                      >
                        {allIngredients.map((ing) => (
                          <option key={ing.id} value={ing.id}>
                            {ing.name_ar}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => removeIngredientRow(index)}
                        className="p-2.5 min-h-[42px] min-w-[42px] flex items-center justify-center text-gray-400 hover:text-red-500 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                        title="حذف المكون"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="0.05"
                        min="0.01"
                        required
                        value={ri.quantity}
                        onChange={(e) => updateIngredientRow(index, 'quantity', Number(e.target.value))}
                        placeholder="الكمية"
                        className="px-3 py-2.5 min-h-[42px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs sm:text-sm"
                      />
                      <select
                        value={ri.unit_id}
                        onChange={(e) => updateIngredientRow(index, 'unit_id', e.target.value)}
                        className="px-3 py-2.5 min-h-[42px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs sm:text-sm"
                      >
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name_ar} ({u.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Instructions Section */}
          <div className="pt-2">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              طريقة التحضير (اختياري)
            </label>
            <textarea
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="اكتب خطوات الطبخ والتحضير هنا بالتفصيل..."
              className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="pt-4 mt-auto">
          <button
            type="button"
            onClick={() => setView('main')}
            className="w-full py-4 min-h-[52px] bg-brand-600 hover:bg-brand-700 active:scale-95 text-white font-extrabold text-sm rounded-2xl shadow-md shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>تأكيد المقادير والرجوع للوصفة</span>
          </button>
        </div>
      </div>
    );
  }

  // View 1: Main Recipe Details
  return (
    <form ref={mainRef} onSubmit={handleSubmit} className="space-y-3.5 animate-fade-in">
      {/* Back Button Bar */}
      <div className="flex items-center justify-start pb-2 border-b border-gray-100 dark:border-gray-800">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs sm:text-sm font-bold transition-all active:scale-95"
        >
          <ChevronRight className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          <span>{recipe ? 'رجوع لتفاصيل الوصفة' : 'رجوع'}</span>
        </button>
      </div>

      {/* Recipe Name */}
      <input
        type="text"
        required
        value={nameAr}
        onChange={(e) => setNameAr(e.target.value)}
        placeholder="اسم الوصفة *"
        className="w-full px-4 py-3.5 min-h-[48px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-bold placeholder:text-gray-400 placeholder:font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
      />

      {/* Category and Max Repetitions in Month */}
      <div className="grid grid-cols-2 gap-3">
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          aria-label="تصنيف الأكلة"
          className="w-full px-3.5 py-3.5 min-h-[48px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-brand-500 focus:outline-none"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name_ar}
            </option>
          ))}
        </select>

        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={servings}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const clean = normalizeArabicNumerals(e.target.value).replace(/\D/g, '');
            if (clean === '') {
              setServings('');
              return;
            }
            const clamped = Math.min(31, Number(clean));
            setServings(String(clamped));
          }}
          placeholder="عدد التكرارات (شهرياً)"
          className="w-full px-4 py-3.5 min-h-[48px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-bold placeholder:text-gray-400 placeholder:font-medium placeholder:text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
          title="عدد التكرارات الشهري (0 يعني غير متاح)"
        />
      </div>

      {/* 4 Meal Slot Checkboxes */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'فطور', checked: forBreakfast, onChange: setForBreakfast },
          { label: 'غداء', checked: forLunch, onChange: setForLunch },
          { label: 'عشاء', checked: forDinner, onChange: setForDinner },
          { label: 'سناك', checked: forSnack, onChange: setForSnack },
        ].map((slot) => (
          <label
            key={slot.label}
            className={`flex items-center justify-center gap-1.5 py-3 min-h-[46px] px-2 rounded-2xl border text-xs sm:text-sm font-extrabold cursor-pointer transition-all select-none active:scale-95 ${
              slot.checked
                ? 'bg-brand-50 dark:bg-brand-950/60 border-brand-500 text-brand-700 dark:text-brand-300 shadow-xs'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
            }`}
          >
            <input
              type="checkbox"
              checked={slot.checked}
              onChange={(e) => slot.onChange(e.target.checked)}
              className="w-4 h-4 accent-brand-600 rounded cursor-pointer"
            />
            <span>{slot.label}</span>
          </label>
        ))}
      </div>

      {/* Image Upload Box from Phone / Device */}
      <div>
        <label className="flex flex-col items-center justify-center w-full h-32 sm:h-36 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-brand-500 rounded-2xl cursor-pointer bg-gray-50/70 dark:bg-gray-800/40 hover:bg-brand-50/20 transition-all overflow-hidden relative group">
          {imageUrl ? (
            <div className="relative w-full h-full">
              <img
                src={imageUrl}
                alt="معاينة الصورة"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-bold gap-1">
                <UploadCloud className="w-5 h-5 text-brand-300" />
                <span>انقر لتغيير الصورة</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-4 text-center">
              <div className="w-10 h-10 rounded-2xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-1.5">
                <UploadCloud className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-gray-700 dark:text-gray-200">
                انقر لاختيار أو التقاط صورة الوصفة
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
            className="text-xs text-red-500 hover:text-red-700 font-bold mt-2 flex items-center gap-1 py-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>إزالة الصورة</span>
          </button>
        )}
      </div>

      {/* Button to Open Ingredients & Instructions View */}
      <button
        type="button"
        onClick={() => setView('ingredients_instructions')}
        className="w-full py-4 px-4 min-h-[58px] rounded-2xl border border-brand-200 dark:border-brand-800/80 bg-brand-50/60 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-bold text-xs sm:text-sm flex items-center justify-between transition-all shadow-sm active:scale-95"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <UtensilsCrossed className="w-4 h-4" />
          </div>
          <div className="text-right">
            <span className="block font-extrabold text-xs sm:text-sm">المقادير وطريقة التحضير</span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400 block font-normal">
              {ingredientsList.length} مقادير مسجلة {instructions ? '• خطوات التحضير مدخلة' : ''}
            </span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-brand-600 dark:text-brand-400 rotate-180" />
      </button>

      {/* Submit & Back Action Buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleBack}
          className="py-3.5 px-5 min-h-[48px] rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-200 font-bold text-xs sm:text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5 border border-gray-200 dark:border-gray-700 shadow-xs"
        >
          <ChevronRight className="w-4 h-4" />
          <span>رجوع</span>
        </button>

        <button
          type="submit"
          disabled={submitting}
          className="flex-1 py-3.5 min-h-[48px] bg-brand-600 hover:bg-brand-700 active:scale-95 text-white font-extrabold text-sm rounded-2xl shadow-md shadow-brand-600/20 transition-all disabled:opacity-50"
        >
          {submitting ? 'جاري الحفظ...' : recipe ? 'حفظ التعديلات' : 'إنشاء الوصفة'}
        </button>
      </div>
    </form>
  );
};
