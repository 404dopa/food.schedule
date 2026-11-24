import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/layout/Header';
import { BottomNavigation } from './components/layout/BottomNavigation';
import { ToastContainer } from './components/common/ToastContainer';
import { BottomSheet } from './components/common/BottomSheet';

import { HomeTab } from './components/home/HomeTab';
import { ScheduleTab } from './components/schedule/ScheduleTab';
import { KitchenTab } from './components/kitchen/KitchenTab';
import { ShoppingTab } from './components/shopping/ShoppingTab';
import { RecipesTab } from './components/recipes/RecipesTab';

import { AddEditIngredientSheet } from './components/sheets/AddEditIngredientSheet';
import { AdjustStockSheet } from './components/sheets/AdjustStockSheet';
import { AddEditRecipeSheet } from './components/sheets/AddEditRecipeSheet';
import { RecipeDetailSheet } from './components/sheets/RecipeDetailSheet';
import { AddMealSheet } from './components/sheets/AddMealSheet';
import { PrepareMealSheet } from './components/sheets/PrepareMealSheet';
import { SmartShoppingSheet } from './components/sheets/SmartShoppingSheet';
import { BuyShoppingItemSheet } from './components/sheets/BuyShoppingItemSheet';
import { AddShoppingItemSheet } from './components/sheets/AddShoppingItemSheet';
import { DailyDashboardSheet } from './components/sheets/DailyDashboardSheet';
import { DayScheduleSheet } from './components/sheets/DayScheduleSheet';
import { SettingsSheet } from './components/sheets/SettingsSheet';
import { HomeQuickMenuSheet } from './components/sheets/HomeQuickMenuSheet';
import { ManageRecipeGroupsSheet } from './components/sheets/ManageRecipeGroupsSheet';
import { ManageIngredientGroupsSheet } from './components/sheets/ManageIngredientGroupsSheet';
import { ExcelModal } from './components/excel/ExcelModal';
import { AlertModal } from './components/common/AlertModal';

import { LoginScreen } from './components/auth/LoginScreen';
import { getSession, BaytiSession } from './services/session';

const AppContent: React.FC = () => {
  const { currentTab, activeSheet, closeSheet, alertModal, closeAlert, triggerRefresh, refreshKey } = useApp();

  // 1. Configure browser scroll restoration
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // 2. Continually save scroll position for the current tab
  useEffect(() => {
    let ticking = false;
    const saveCurrentScroll = () => {
      const y = window.scrollY;
      sessionStorage.setItem(`bayti_scroll_${currentTab}`, y.toString());
      localStorage.setItem(`bayti_scroll_${currentTab}`, y.toString());
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          saveCurrentScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    const handleBeforeUnload = () => {
      saveCurrentScroll();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      saveCurrentScroll();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentTab]);

  // 3. Restore scroll position when tab changes, page refreshes, or data loads
  useEffect(() => {
    const savedYStr =
      sessionStorage.getItem(`bayti_scroll_${currentTab}`) ||
      localStorage.getItem(`bayti_scroll_${currentTab}`);
    const savedY = savedYStr ? parseInt(savedYStr, 10) : 0;

    let isRestored = false;
    let attempts = 0;
    const maxAttempts = 30; // Check up to 3 seconds

    const tryRestore = () => {
      if (isRestored) return;

      if (savedY <= 0) {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        isRestored = true;
        return;
      }

      const docHeight = document.documentElement.scrollHeight;
      // When content has loaded enough to scroll to saved position, or when max timeout reached
      if (docHeight >= savedY + 60 || attempts >= maxAttempts) {
        window.scrollTo({ top: savedY, behavior: 'instant' as ScrollBehavior });
        isRestored = true;
      } else {
        attempts++;
      }
    };

    // Immediate attempt
    tryRestore();

    // Observe body height changes as async tab data renders
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && document.body) {
      observer = new ResizeObserver(() => {
        if (!isRestored) {
          tryRestore();
        } else if (observer) {
          observer.disconnect();
        }
      });
      observer.observe(document.body);
    }

    const interval = setInterval(() => {
      if (isRestored || attempts >= maxAttempts) {
        clearInterval(interval);
        if (observer) observer.disconnect();
      } else {
        tryRestore();
      }
    }, 100);

    return () => {
      clearInterval(interval);
      if (observer) observer.disconnect();
    };
  }, [currentTab, refreshKey]);

  // Bottom Sheet Title & Subtitle Resolver
  const getSheetHeader = () => {
    if (!activeSheet) return { title: '', subtitle: '' };
    switch (activeSheet.type) {
      case 'daily_dashboard':
        return { title: 'لوحة التحكم اليومية', subtitle: activeSheet.data?.todayStr?.replace(/-/g, '/') };
      case 'day_schedule':
        return { title: `جدول يوم ${activeSheet.data?.dayOfMonth}`, subtitle: 'تعيين وتعديل أكلات اليوم المتكررة شهرياً' };
      case 'add_ingredient':
        return { title: 'إضافة مكون جديد', subtitle: 'إدخال مادة جديدة لمؤونة المطبخ' };
      case 'edit_ingredient':
        return { title: 'تعديل بيانات المكون', subtitle: activeSheet.data?.name_ar };
      case 'adjust_stock':
        return { title: 'ضبط كمية المخزون', subtitle: activeSheet.data?.name_ar };
      case 'add_recipe':
        return { title: 'إضافة وصفة جديدة', subtitle: 'كتيب الطبخ المنزلي' };
      case 'edit_recipe':
        return { title: 'تعديل الوصفة', subtitle: '' };
      case 'recipe_detail':
        return { title: 'تفاصيل الأكلة', subtitle: activeSheet.data?.name_ar };
      case 'add_meal':
        return { title: 'إضافة وجبة للجدول', subtitle: activeSheet.data?.date };
      case 'prepare_meal':
        return { title: 'تحضير الوجبة وخصم المواد', subtitle: activeSheet.data?.recipe?.name_ar };
      case 'smart_shopping':
        return { title: 'توليد قائمة تسوق ذكية', subtitle: 'حساب النواقص آلياً من جدول الوجبات' };
      case 'buy_shopping_item':
        return { title: 'تأكيد شراء المادة', subtitle: activeSheet.data?.ingredient?.name_ar };
      case 'add_shopping_item':
        return { title: 'إضافة مادة لقائمة التسوق', subtitle: 'إضافة يدوية' };
      case 'excel_modal':
        return { title: 'إدارة وتصدير Excel', subtitle: 'تصدير واستيراد المكونات والوصفات' };
      case 'settings':
        return { title: 'التحكم والإعدادات', subtitle: 'إظهار الواجهات، تخصيص التطبيق، وتصفير النظام' };
      case 'manage_recipe_groups':
        return { title: 'إدارة التصنيفات', subtitle: 'إضافة تصنيف جديد وحذف التصنيفات' };
      case 'manage_ingredient_groups':
        return { title: 'مجموعات المكونات', subtitle: 'إضافة مجموعة جديدة وحذف المجموعات' };
      case 'home_menu':
        return { title: 'قائمة الخيارات', subtitle: 'التحكم والمزامنة والإعدادات' };
      default:
        return { title: '', subtitle: '' };
    }
  };

  const { title, subtitle } = getSheetHeader();

  return (
    <div className="min-h-screen min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-gray-50 dark:bg-gray-950 flex flex-col transition-colors duration-200 overscroll-none">
      {/* Main Content Area */}
      <main className="flex-1 px-4 pt-4 pb-6 safe-top max-w-2xl mx-auto w-full overflow-x-hidden">
        {currentTab === 'home' && <HomeTab />}
        {currentTab === 'schedule' && <ScheduleTab />}
        {currentTab === 'kitchen' && <KitchenTab />}
        {currentTab === 'shopping' && <ShoppingTab />}
        {currentTab === 'recipes' && <RecipesTab />}
      </main>

      {/* Fixed Bottom Navigation */}
      <BottomNavigation />

      {/* Centralized Dynamic Bottom Sheet (Max Navigation Depth = 2) */}
      <BottomSheet
        isOpen={activeSheet !== null}
        onClose={closeSheet}
        title={title}
        subtitle={subtitle}
        hideHeader={activeSheet?.type === 'recipe_detail' || activeSheet?.type === 'day_schedule'}
        hideCloseButton={activeSheet?.type === 'edit_recipe'}
      >
        {activeSheet?.type === 'daily_dashboard' && (
          <DailyDashboardSheet
            todayStr={activeSheet.data?.todayStr}
            todayItems={activeSheet.data?.todayItems || []}
            totalCost={activeSheet.data?.totalCost || 0}
          />
        )}
        {activeSheet?.type === 'day_schedule' && (
          <DayScheduleSheet
            dayOfMonth={activeSheet.data?.dayOfMonth}
            year={activeSheet.data?.year}
            month={activeSheet.data?.month}
            items={activeSheet.data?.items || []}
            onSuccess={triggerRefresh}
          />
        )}
        {activeSheet?.type === 'add_ingredient' && (
          <AddEditIngredientSheet onSuccess={triggerRefresh} />
        )}
        {activeSheet?.type === 'edit_ingredient' && (
          <AddEditIngredientSheet
            ingredient={activeSheet.data}
            onSuccess={triggerRefresh}
          />
        )}
        {activeSheet?.type === 'adjust_stock' && (
          <AdjustStockSheet
            ingredient={activeSheet.data}
            onSuccess={triggerRefresh}
          />
        )}
        {activeSheet?.type === 'add_recipe' && (
          <AddEditRecipeSheet onSuccess={triggerRefresh} />
        )}
        {activeSheet?.type === 'edit_recipe' && (
          <AddEditRecipeSheet
            recipe={activeSheet.data}
            onSuccess={triggerRefresh}
          />
        )}
        {activeSheet?.type === 'recipe_detail' && (
          <RecipeDetailSheet
            recipe={activeSheet.data?.recipe || activeSheet.data}
            mealItem={activeSheet.data?.mealItem}
            onSuccess={triggerRefresh}
          />
        )}
        {activeSheet?.type === 'add_meal' && (
          <AddMealSheet
            initialDate={activeSheet.data?.date}
            initialRecipeId={activeSheet.data?.recipe_id}
            onSuccess={triggerRefresh}
          />
        )}
        {activeSheet?.type === 'prepare_meal' && (
          <PrepareMealSheet
            mealItem={activeSheet.data}
            onSuccess={triggerRefresh}
          />
        )}
        {activeSheet?.type === 'smart_shopping' && (
          <SmartShoppingSheet onSuccess={triggerRefresh} />
        )}
        {activeSheet?.type === 'buy_shopping_item' && (
          <BuyShoppingItemSheet
            item={activeSheet.data}
            onSuccess={triggerRefresh}
          />
        )}
        {activeSheet?.type === 'add_shopping_item' && (
          <AddShoppingItemSheet
            listId={activeSheet.data?.list_id}
            onSuccess={triggerRefresh}
          />
        )}
        {activeSheet?.type === 'excel_modal' && (
          <ExcelModal onSuccess={triggerRefresh} />
        )}
        {activeSheet?.type === 'settings' && <SettingsSheet />}
        {activeSheet?.type === 'manage_recipe_groups' && (
          <ManageRecipeGroupsSheet onSuccess={triggerRefresh} />
        )}
        {activeSheet?.type === 'manage_ingredient_groups' && (
          <ManageIngredientGroupsSheet onSuccess={triggerRefresh} />
        )}
        {activeSheet?.type === 'home_menu' && <HomeQuickMenuSheet />}
      </BottomSheet>

      {/* Global Alert Modal for Limit Warnings */}
      {alertModal?.isOpen && (
        <AlertModal
          isOpen={alertModal.isOpen}
          onClose={closeAlert}
          title={alertModal.title}
          message={alertModal.message}
          details={alertModal.details}
        />
      )}
    </div>
  );
};

export default function App() {
  const [session, setSession] = useState<BaytiSession | null>(() => getSession());

  useEffect(() => {
    const saved = localStorage.getItem('bayti_theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const handleLogin = () => {
    setSession(getSession());
  };

  const handleLogout = () => {
    setSession(null);
  };

  const handleUpdateSession = (newSession: BaytiSession) => {
    setSession(newSession);
  };

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <AppProvider
      userName={session.user_name}
      familyCode={session.family_code}
      householdId={session.household_id}
      onLogout={handleLogout}
      onUpdateSession={handleUpdateSession}
    >
      <AppContent />
    </AppProvider>
  );
}
