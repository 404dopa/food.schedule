import React, { useRef } from 'react';
import { useApp, MainTab } from '../../context/AppContext';
import { Home, CalendarDays, Refrigerator, ShoppingCart, BookOpen } from 'lucide-react';

interface NavItem {
  id: MainTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { id: 'home', label: 'الرئيسية', icon: Home },
  { id: 'schedule', label: 'الجدول', icon: CalendarDays },
  { id: 'kitchen', label: 'المطبخ', icon: Refrigerator },
  { id: 'shopping', label: 'التسوق', icon: ShoppingCart },
  { id: 'recipes', label: 'الوصفات', icon: BookOpen },
];

export const BottomNavigation: React.FC = () => {
  const { currentTab, setCurrentTab, enabledTabs, openSheet } = useApp();
  const longPressTimerRef = useRef<any>(null);
  const isLongPressRef = useRef<boolean>(false);

  const visibleNavItems = navItems.filter((item) => enabledTabs[item.id]);

  const startLongPress = () => {
    isLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(50);
        } catch (_) {}
      }
      openSheet('home_menu');
    }, 450);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleHomeClick = () => {
    if (isLongPressRef.current) {
      // Was a long press, ignore the normal click
      isLongPressRef.current = false;
      return;
    }
    setCurrentTab('home');
  };

  return (
    <nav
      aria-label="شريط التنقل الرئيسي"
      className="fixed inset-x-0 bottom-3 sm:bottom-4 z-40 flex justify-center px-3 pointer-events-none select-none"
    >
      <div className="pointer-events-auto w-full max-w-md relative px-2 py-1.5 rounded-[28px] bg-white/92 dark:bg-gray-900/92 backdrop-blur-md border border-gray-200/80 dark:border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:shadow-[0_12px_28px_rgba(0,0,0,0.5)] flex items-center justify-around">
        {visibleNavItems.map((item) => {
          const isActive = currentTab === item.id;
          const Icon = item.icon;
          const isHome = item.id === 'home';

          return (
            <button
              key={item.id}
              onClick={isHome ? handleHomeClick : () => setCurrentTab(item.id)}
              onMouseDown={isHome ? startLongPress : undefined}
              onMouseUp={isHome ? cancelLongPress : undefined}
              onMouseLeave={isHome ? cancelLongPress : undefined}
              onTouchStart={isHome ? startLongPress : undefined}
              onTouchEnd={isHome ? cancelLongPress : undefined}
              onTouchCancel={isHome ? cancelLongPress : undefined}
              onContextMenu={
                isHome
                  ? (e) => {
                      e.preventDefault();
                      cancelLongPress();
                      openSheet('home_menu');
                    }
                  : undefined
              }
              className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-2xl transition-all duration-200 cursor-pointer active:scale-95 ${
                isActive
                  ? 'text-brand-600 dark:text-brand-400 font-black'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <div
                className={`p-1.5 rounded-xl transition-all duration-200 flex items-center justify-center ${
                  isActive
                    ? 'bg-brand-500/15 dark:bg-brand-400/20 shadow-sm shadow-brand-500/10 scale-105'
                    : ''
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
              </div>
              <span className={`text-[11px] mt-0.5 tracking-tight ${isActive ? 'font-black' : 'font-semibold'}`}>
                {item.label}
              </span>
              {isActive && (
                <div className="w-1.5 h-1.5 bg-brand-600 dark:bg-brand-400 rounded-full shadow-[0_0_8px_rgba(225,29,72,0.85)] mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
