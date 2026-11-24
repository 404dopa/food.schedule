import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';
import { getSession, clearSession, saveSession, BaytiSession } from '../services/session';

export type MainTab = 'home' | 'schedule' | 'kitchen' | 'shopping' | 'recipes';

export interface EnabledTabs {
  home: boolean;
  schedule: boolean;
  kitchen: boolean;
  shopping: boolean;
  recipes: boolean;
}

export type SheetType =
  | 'daily_dashboard'
  | 'day_schedule'
  | 'add_ingredient'
  | 'edit_ingredient'
  | 'adjust_stock'
  | 'add_recipe'
  | 'edit_recipe'
  | 'recipe_detail'
  | 'add_meal'
  | 'prepare_meal'
  | 'smart_shopping'
  | 'buy_shopping_item'
  | 'add_shopping_item'
  | 'excel_modal'
  | 'settings'
  | 'manage_recipe_groups'
  | 'manage_ingredient_groups'
  | 'home_menu';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export interface AlertModalState {
  isOpen: boolean;
  title: string;
  message: string;
  details?: string;
}

interface AppContextType {
  currentTab: MainTab;
  setCurrentTab: (tab: MainTab) => void;
  enabledTabs: EnabledTabs;
  toggleTabVisibility: (tab: keyof EnabledTabs) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  networkStatus: 'online' | 'offline' | 'syncing';
  syncNow: () => Promise<void>;
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  removeToast: (id: string) => void;
  activeSheet: { type: SheetType; data?: any } | null;
  openSheet: (type: SheetType, data?: any) => void;
  closeSheet: () => void;
  alertModal: AlertModalState | null;
  showAlert: (title: string, message: string, details?: string) => void;
  closeAlert: () => void;
  refreshKey: number;
  triggerRefresh: () => void;
  // Session
  userName: string;
  familyCode: string;
  householdId: string;
  logout: () => void;
  updateSession: (newSession: BaytiSession) => void;
}

const DEFAULT_ENABLED_TABS: EnabledTabs = {
  home: true,
  schedule: true,
  kitchen: true,
  shopping: true,
  recipes: true,
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{
  children: ReactNode;
  userName?: string;
  familyCode?: string;
  householdId?: string;
  onLogout?: () => void;
  onUpdateSession?: (session: BaytiSession) => void;
}> = ({
  children,
  userName = '',
  familyCode = '',
  householdId = 'default',
  onLogout,
  onUpdateSession,
}) => {
  const [enabledTabs, setEnabledTabs] = useState<EnabledTabs>(() => {
    try {
      const saved = localStorage.getItem('bayti_enabled_tabs');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          home: true, // Always true
          schedule: parsed.schedule !== undefined ? !!parsed.schedule : true,
          kitchen: parsed.kitchen !== undefined ? !!parsed.kitchen : true,
          shopping: parsed.shopping !== undefined ? !!parsed.shopping : true,
          recipes: parsed.recipes !== undefined ? !!parsed.recipes : true,
        };
      }
    } catch (e) {
      console.error('Failed to parse enabled tabs from storage', e);
    }
    return DEFAULT_ENABLED_TABS;
  });

  const [currentTab, setCurrentTab] = useState<MainTab>(() => {
    try {
      const savedTab = localStorage.getItem('bayti_current_tab') as MainTab;
      if (savedTab && ['home', 'schedule', 'kitchen', 'shopping', 'recipes'].includes(savedTab)) {
        const savedEnabled = localStorage.getItem('bayti_enabled_tabs');
        if (savedEnabled) {
          const parsed = JSON.parse(savedEnabled);
          if (parsed[savedTab] === false) return 'home';
        }
        return savedTab;
      }
    } catch (e) {
      console.error('Failed to parse current tab from storage', e);
    }
    return 'home';
  });

  useEffect(() => {
    try {
      localStorage.setItem('bayti_current_tab', currentTab);
    } catch (e) {
      console.error('Failed to save current tab to storage', e);
    }
  }, [currentTab]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('bayti_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline' | 'syncing'>(
    navigator.onLine ? 'online' : 'offline'
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeSheet, setActiveSheet] = useState<{ type: SheetType; data?: any } | null>(null);
  const [alertModal, setAlertModal] = useState<AlertModalState | null>(null);

  const showAlert = (title: string, message: string, details?: string) => {
    setAlertModal({ isOpen: true, title, message, details });
  };

  const closeAlert = () => {
    setAlertModal(null);
  };
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  // Apply theme class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('bayti_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const toggleTabVisibility = (tab: keyof EnabledTabs) => {
    if (tab === 'home') return; // Cannot disable Home
    setEnabledTabs((prev) => {
      const next = { ...prev, [tab]: !prev[tab] };
      localStorage.setItem('bayti_enabled_tabs', JSON.stringify(next));
      return next;
    });

    // If active tab is being turned off, fall back to home
    if (currentTab === tab) {
      setCurrentTab('home');
    }
  };

  const showToast = (_message: string, _type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    // Notifications disabled per user request
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const openSheet = (type: SheetType, data?: any) => {
    setActiveSheet({ type, data });
  };

  const closeSheet = () => {
    setActiveSheet(null);
  };

  const syncNow = async () => {
    if (!navigator.onLine) {
      showToast('أنت غير متصل بالإنترنت حالياً', 'warning');
      return;
    }
    setNetworkStatus('syncing');
    try {
      const res = await api.syncOfflineQueue();
      if (res.success > 0) {
        showToast(`تمت مزامنة ${res.success} عملية بنجاح!`, 'success');
        triggerRefresh();
      }
      setNetworkStatus('online');
    } catch (e) {
      setNetworkStatus('online');
    }
  };

  // Listen to network changes
  useEffect(() => {
    const handleOnline = () => {
      setNetworkStatus('online');
      showToast('تمت استعادة الاتصال بالإنترنت - جاري المزامنة', 'info');
      syncNow();
    };
    const handleOffline = () => {
      setNetworkStatus('offline');
      showToast('انقطع الاتصال بالإنترنت - يتم العمل في الوضع دون اتصال', 'warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial sync
    if (navigator.onLine) {
      syncNow();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Real-time synchronization via Server-Sent Events (SSE)
  useEffect(() => {
    const url = `${api.getBaseUrl()}/events`;
    let eventSource: EventSource | null = null;
    let reconnectTimer: any = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource(url);

        eventSource.onopen = () => {
          // Connected successfully
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'ping') return;
            // Real-time server event triggered (meal, schedule, recipe, inventory)
            triggerRefresh();
          } catch (e) {
            triggerRefresh();
          }
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              connectSSE();
            }, 3000);
          }
        };
      } catch (e) {
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connectSSE();
          }, 5000);
        }
      }
    };

    connectSSE();

    // Auto refresh when tab/browser comes back into view or focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerRefresh();
      }
    };

    const handleWindowFocus = () => {
      triggerRefresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentTab,
        setCurrentTab,
        enabledTabs,
        toggleTabVisibility,
        theme,
        toggleTheme,
        networkStatus,
        syncNow,
        toasts,
        showToast,
        removeToast,
        activeSheet,
        openSheet,
        closeSheet,
        alertModal,
        showAlert,
        closeAlert,
        refreshKey,
        triggerRefresh,
        userName,
        familyCode,
        householdId,
        logout: () => {
          clearSession();
          if (onLogout) onLogout();
        },
        updateSession: (newSession: BaytiSession) => {
          saveSession(newSession);
          if (onUpdateSession) onUpdateSession(newSession);
        },
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
