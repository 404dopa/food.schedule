import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { IngredientImportPreviewItem } from '../../types';
import {
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

export const ExcelModal: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const { showToast, closeSheet } = useApp();
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<IngredientImportPreviewItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // Export handlers
  const handleExportIngredients = async () => {
    try {
      const blob = await api.exportIngredientsExcel();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bayti_ingredients_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('تم تحميل ملف إكسل للمكونات والمخزون بنجاح!', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleExportRecipes = async () => {
    try {
      const blob = await api.exportRecipesExcel();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bayti_recipes_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('تم تحميل ملف إكسل للوصفات بنجاح!', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Import file selection & preview
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setLoading(true);
    setPreview(null);

    try {
      const data = await api.previewImportIngredientsExcel(selected);
      setPreview(data);
      showToast(`تمت قراءة ${data.length} بند من ملف الإكسل للمعاينة`, 'info');
    } catch (err: any) {
      showToast(err.message || 'فشل فحص ملف الإكسل', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Commit Import
  const handleCommitImport = async () => {
    if (!preview || preview.length === 0) return;
    setImporting(true);
    try {
      const res = await api.commitImportIngredientsExcel(preview);
      showToast(res.message, 'success');
      onSuccess();
      closeSheet();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl">
        <button
          onClick={() => setActiveTab('export')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'export'
              ? 'bg-white dark:bg-gray-900 text-brand-600 dark:text-brand-400 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          تصدير ملفات Excel
        </button>
        <button
          onClick={() => setActiveTab('import')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'import'
              ? 'bg-white dark:bg-gray-900 text-brand-600 dark:text-brand-400 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          استيراد ومعاينة Excel
        </button>
      </div>

      {activeTab === 'export' ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            يمكنك تصدير كافة بيانات المطبخ والوصفات إلى جداول Excel حقيقية (.xlsx) للاحتفاظ بنسخة احتياطية أو تعديلها.
          </p>

          <div className="space-y-2">
            <button
              onClick={handleExportIngredients}
              className="w-full p-4 bg-gray-50 dark:bg-gray-800/60 hover:bg-brand-50 dark:hover:bg-brand-950/40 border border-gray-200 dark:border-gray-700 rounded-3xl flex items-center justify-between text-right transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-gray-900 dark:text-white group-hover:text-brand-600">
                    تصدير المكونات والمخزون
                  </h4>
                  <span className="text-[11px] text-gray-400">
                    يشمل الأسعار، الوحدات، والكميات المتوفرة
                  </span>
                </div>
              </div>
              <Download className="w-4 h-4 text-gray-400 group-hover:text-brand-600" />
            </button>

            <button
              onClick={handleExportRecipes}
              className="w-full p-4 bg-gray-50 dark:bg-gray-800/60 hover:bg-brand-50 dark:hover:bg-brand-950/40 border border-gray-200 dark:border-gray-700 rounded-3xl flex items-center justify-between text-right transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand-100 dark:bg-brand-950 text-brand-600 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-gray-900 dark:text-white group-hover:text-brand-600">
                    تصدير كتيب الوصفات
                  </h4>
                  <span className="text-[11px] text-gray-400">
                    يشمل المقادير، المجموعات، وطرق التحضير
                  </span>
                </div>
              </div>
              <Download className="w-4 h-4 text-gray-400 group-hover:text-brand-600" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-3xl p-6 text-center hover:border-brand-500 transition-colors">
            <Upload className="w-8 h-8 text-brand-600 mx-auto mb-2" />
            <p className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-1">
              اسحب وأفلت ملف Excel (.xlsx) هنا، أو اضغط للاختيار
            </p>
            <p className="text-[10px] text-gray-400 mb-3">
              يدعم استيراد المكونات مع إنشاء المجموعات غير المسجلة تلقائياً
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
            />
          </div>

          {loading && (
            <div className="text-center py-4 text-xs text-gray-400">
              جاري فحص أعمدة وبيانات الملف والتحقق من التكرار...
            </div>
          )}

          {preview && preview.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-gray-800 dark:text-gray-200">
                <span>معاينة البيانات قبل الاعتماد ({preview.length} مادة):</span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                  {preview.filter((p) => p.status === 'new').length} جديد • {preview.filter((p) => p.status === 'update').length} تحديث
                </span>
              </div>

              {/* Preview Table */}
              <div className="max-h-56 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-2xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0 text-gray-600 dark:text-gray-300 font-bold">
                    <tr>
                      <th className="p-2">المكون</th>
                      <th className="p-2">التصنيف</th>
                      <th className="p-2">الوحدة</th>
                      <th className="p-2">السعر</th>
                      <th className="p-2">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {preview.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                        <td className="p-2 font-bold text-gray-900 dark:text-white">{row.name_ar}</td>
                        <td className="p-2 text-gray-500">{row.group_name || 'عام'}</td>
                        <td className="p-2 text-gray-500">{row.unit_code}</td>
                        <td className="p-2 text-gray-800 dark:text-gray-200">{row.unit_price} د.ع</td>
                        <td className="p-2">
                          {row.status === 'new' ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              جديد
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                              موجود
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={handleCommitImport}
                disabled={importing}
                className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-2xl shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {importing ? 'جاري الاستيراد والحفظ...' : 'تأكيد وحفظ البيانات في قاعدة البيانات'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
