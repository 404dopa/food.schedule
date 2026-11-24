import React, { useState } from 'react';
import { Users, KeyRound, UserCircle2, Loader2, ArrowLeft, ChevronLeft } from 'lucide-react';
import { api } from '../../services/api';
import { saveSession } from '../../services/session';
import { normalizeArabicNumerals } from '../../utils/format';

interface Props {
  onLogin: () => void;
}

type Step = 'welcome' | 'confirm_create';

export const LoginScreen: React.FC<Props> = ({ onLogin }) => {
  const [step, setStep] = useState<Step>('welcome');
  const [userName, setUserName] = useState('');
  const [familyCode, setFamilyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingCreate, setPendingCreate] = useState<{ userName: string; familyCode: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const name = userName.trim();
    const code = normalizeArabicNumerals(familyCode).trim();

    if (!name) {
      setError('يرجى إدخال اسمك');
      return;
    }
    if (code && !/^\d{6}$/.test(code)) {
      setError('رمز العائلة يجب أن يكون 6 أرقام');
      return;
    }

    setLoading(true);
    try {
      const res = await joinFamily(name, code, false);
      if (res.suggest_create) {
        // Family code doesn't exist → ask user to confirm
        setPendingCreate({ userName: name, familyCode: code });
        setStep('confirm_create');
      } else {
        // Joined or created successfully
        saveSession({
          user_name: res.user_name,
          household_id: res.household_id,
          family_code: res.family_code,
        });
        onLogin();
      }
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ. يرجى المحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCreate = async () => {
    if (!pendingCreate) return;
    setLoading(true);
    setError('');
    try {
      const res = await joinFamily(pendingCreate.userName, pendingCreate.familyCode, true);
      saveSession({
        user_name: res.user_name,
        household_id: res.household_id,
        family_code: res.family_code,
      });
      onLogin();
    } catch (err: any) {
      setError(err?.message || 'فشل إنشاء العائلة');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('welcome');
    setPendingCreate(null);
    setError('');
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full overflow-x-hidden bg-[#FAFAFA] dark:bg-gray-950 flex flex-col justify-between selection:bg-brand-500 selection:text-white" dir="rtl">
      {/* Top Banner (Figma Foodie curved header) */}
      <div className="w-full bg-gradient-to-b from-brand-600 to-brand-700 pt-12 pb-16 px-6 rounded-b-[44px] shadow-xl shadow-brand-600/15 relative overflow-hidden select-none">
        {/* Soft decorative background circles */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute top-10 -left-10 w-32 h-32 bg-brand-500/30 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            ياهلا ومية هلا
          </h1>
        </div>
      </div>

      {/* Main Floating Card (Figma style) */}
      <div className="flex-1 flex flex-col items-center justify-start px-4 -mt-10 relative z-20 pb-8">
        <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-[32px] p-6 sm:p-7 shadow-2xl shadow-gray-200/80 dark:shadow-black/60 border border-gray-100 dark:border-gray-800 transition-all">
          {step === 'welcome' && (
            <>
              {/* Card Header */}
              <div className="text-center mb-6">
                <h2 className="text-xl font-black text-gray-900 dark:text-white">
                  تسجيل الدخول
                </h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-1">
                  سجّل اسمك وتزامن مع عائلتك على نفس البيانات
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* User Name Field */}
                <div>
                  <label className="block text-xs font-extrabold text-gray-700 dark:text-gray-300 mb-1.5">
                    اسم المستخدم
                  </label>
                  <div className="relative">
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <UserCircle2 className="w-5 h-5" />
                    </div>
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => { setUserName(e.target.value); setError(''); }}
                      placeholder="أحمد"
                      disabled={loading}
                      autoComplete="off"
                      className="w-full pr-11 pl-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/80 text-gray-900 dark:text-white text-sm font-bold placeholder:text-gray-400 placeholder:font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500 transition-all"
                    />
                  </div>
                </div>

                {/* Family Code Field */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-extrabold text-gray-700 dark:text-gray-300">
                      رمز العائلة
                    </label>
                    <span className="text-[11px] text-gray-400 font-medium">
                      (اختياري - 6 أرقام)
                    </span>
                  </div>
                  <div className="relative">
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={familyCode}
                      onChange={(e) => { setFamilyCode(normalizeArabicNumerals(e.target.value).replace(/\D/g, '')); setError(''); }}
                      placeholder="000000"
                      disabled={loading}
                      className="w-full pr-11 pl-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/80 text-gray-900 dark:text-white text-center tracking-[0.4em] font-mono font-black text-lg placeholder:text-gray-300 placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5 font-medium leading-relaxed">
                    لديك رمز؟ أدخله للمزامنة، أو اتركه فارغاً لإنشاء عائلة جديدة تلقائياً.
                  </p>
                </div>

                {/* Error message */}
                {error && (
                  <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-300 text-xs font-bold text-center animate-shake">
                    {error}
                  </div>
                )}

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading || !userName.trim()}
                    className="w-full py-4 px-6 bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white font-black text-sm rounded-2xl shadow-xl shadow-brand-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Users className="w-5 h-5" />
                        <span>الدخول للنظام</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 'confirm_create' && (
            <>
              {/* Header */}
              <div className="text-center mb-5">
                <div className="w-14 h-14 mx-auto mb-3 bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 rounded-2xl flex items-center justify-center">
                  <Users className="w-7 h-7" />
                </div>
                <h2 className="text-lg font-black text-gray-900 dark:text-white">
                  إنشاء عائلة جديدة؟
                </h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  الرمز <span className="font-mono font-black text-brand-600">{pendingCreate?.familyCode}</span> غير مستخدم مسبقاً
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700/60 text-xs text-gray-600 dark:text-gray-300 leading-relaxed font-medium">
                  لا توجد عائلة بهذا الرمز حالياً. هل تريد اعتماده رمزاً لعائلتك الجديدة لمزامنة الوجبات وقوائم التسوق مع باقي أفراد البيت؟
                </div>

                {error && (
                  <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-300 text-xs font-bold text-center">
                    {error}
                  </div>
                )}

                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={loading}
                    className="flex-1 py-3 px-4 rounded-2xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    رجوع
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCreate}
                    disabled={loading}
                    className="flex-1 py-3 px-4 rounded-2xl bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-brand-600/25 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Users className="w-4 h-4" />
                        <span>إنشاء العائلة</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer info */}
        <p className="mt-5 text-[11px] text-gray-400 dark:text-gray-600 text-center font-medium max-w-xs">
          يتزامن كل أفراد العائلة بنفس الرمز تلقائياً على جميع الأجهزة
        </p>

        {/* Developer Credit */}
        <div className="mt-3 pb-2 text-center">
          <a
            href="https://www.instagram.com/3d2000"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50/60 dark:hover:bg-brand-950/30 transition-all"
          >
            <span>المطور :</span>
            <span dir="ltr" className="font-mono font-extrabold text-brand-600 dark:text-brand-400">
              3d2000
            </span>
          </a>
        </div>
      </div>
    </div>
  );
};

// ─── API helper ──────────────────────────────────────────────────────────────
async function joinFamily(userName: string, familyCode: string, createNew: boolean) {
  const res = await fetch(`${getApiBase()}/api/session/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_name: userName, family_code: familyCode, create_new: createNew }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function getApiBase(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    const base = (import.meta.env.VITE_API_BASE_URL as string).replace(/\/api$/, '');
    return base;
  }
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return window.location.origin;
    }
    return `http://${window.location.hostname}:8080`;
  }
  return 'http://localhost:8080';
}
