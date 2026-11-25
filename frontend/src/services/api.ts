import {
  Ingredient,
  IngredientGroup,
  Recipe,
  RecipeGroup,
  MealPlanItem,
  MonthlyScheduleItem,
  ShoppingList,
  ShoppingItem,
  Unit,
  Purchase,
  IngredientImportPreviewItem,
} from '../types';
import { getHouseholdId } from './session';

const getApiBase = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return `${window.location.origin}/api`;
    }
    return `http://${window.location.hostname}:8080/api`;
  }
  return 'http://localhost:8080/api';
};

const API_BASE = getApiBase();

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function withHousehold(endpoint: string): string {
  const hid = getHouseholdId();
  const sep = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${sep}household_id=${encodeURIComponent(hid)}`;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${withHousehold(endpoint)}`;
  const res = await fetch(url, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-Household-Id': getHouseholdId(),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    const error = new Error(errData.message || errData.error || 'Request failed');
    (error as any).data = errData;
    throw error;
  }

  return res.json();
}

export const api = {
  getBaseUrl(): string {
    return API_BASE;
  },

  // Units
  async getUnits(): Promise<Unit[]> {
    return request<Unit[]>('/units');
  },

  // Ingredient Groups
  async getIngredientGroups(): Promise<IngredientGroup[]> {
    return request<IngredientGroup[]>('/ingredient-groups');
  },

  async createIngredientGroup(nameAr: string): Promise<IngredientGroup> {
    return request<IngredientGroup>('/ingredient-groups', {
      method: 'POST',
      body: JSON.stringify({ name_ar: nameAr }),
    });
  },

  async deleteIngredientGroup(id: string): Promise<void> {
    await request(`/ingredient-groups/${id}`, {
      method: 'DELETE',
    });
  },

  // Ingredients
  async getIngredients(groupId?: string, search?: string): Promise<Ingredient[]> {
    let endpoint = '/ingredients?';
    if (groupId) endpoint += `group_id=${groupId}&`;
    if (search) endpoint += `search=${encodeURIComponent(search)}&`;
    return request<Ingredient[]>(endpoint);
  },

  async createIngredient(data: Partial<Ingredient> & { initial_quantity?: number }): Promise<Ingredient> {
    const id = data.id || generateUUID();
    return request<Ingredient>('/ingredients', {
      method: 'POST',
      body: JSON.stringify({ ...data, id }),
    });
  },

  async updateIngredient(id: string, data: Partial<Ingredient>): Promise<Ingredient> {
    return request<Ingredient>(`/ingredients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteIngredient(id: string): Promise<void> {
    await request(`/ingredients/${id}`, { method: 'DELETE' });
  },

  // Inventory adjustment
  async adjustInventory(req: {
    ingredient_id: string;
    quantity: number;
    unit_id: string;
    type: 'purchase' | 'consumption' | 'adjustment' | 'waste';
    notes?: string;
    unit_price?: number;
  }) {
    const idempotency_key = generateUUID();
    return request('/inventory/adjust', {
      method: 'POST',
      body: JSON.stringify({ ...req, idempotency_key }),
    });
  },

  // Recipe Groups
  async getRecipeGroups(): Promise<RecipeGroup[]> {
    return request<RecipeGroup[]>('/recipe-groups');
  },

  async createRecipeGroup(nameAr: string): Promise<RecipeGroup> {
    return request<RecipeGroup>('/recipe-groups', {
      method: 'POST',
      body: JSON.stringify({ name_ar: nameAr }),
    });
  },

  async deleteRecipeGroup(id: string): Promise<void> {
    await request(`/recipe-groups/${id}`, {
      method: 'DELETE',
    });
  },

  // Recipes
  async getRecipes(groupId?: string, search?: string): Promise<Recipe[]> {
    let endpoint = '/recipes?';
    if (groupId) endpoint += `group_id=${groupId}&`;
    if (search) endpoint += `search=${encodeURIComponent(search)}&`;
    return request<Recipe[]>(endpoint);
  },

  async createRecipe(data: Partial<Recipe>): Promise<Recipe> {
    const id = data.id || generateUUID();
    return request<Recipe>('/recipes', {
      method: 'POST',
      body: JSON.stringify({ ...data, id }),
    });
  },

  async updateRecipe(id: string, data: Partial<Recipe>): Promise<Recipe> {
    return request<Recipe>(`/recipes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteRecipe(id: string): Promise<void> {
    await request(`/recipes/${id}`, { method: 'DELETE' });
  },

  async duplicateRecipe(id: string, nameAr?: string): Promise<Recipe> {
    return request<Recipe>(`/recipes/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name_ar: nameAr }),
    });
  },

  // Meal Plans
  async getMealPlans(startDate: string, endDate: string): Promise<MealPlanItem[]> {
    return request<MealPlanItem[]>(`/meal-plans?start_date=${startDate}&end_date=${endDate}`);
  },

  async addMealPlanItem(data: Partial<MealPlanItem>): Promise<MealPlanItem> {
    const id = data.id || generateUUID();
    return request<MealPlanItem>('/meal-plans/items', {
      method: 'POST',
      body: JSON.stringify({ ...data, id }),
    });
  },

  async deleteMealPlanItem(id: string): Promise<void> {
    await request(`/meal-plans/items/${id}`, { method: 'DELETE' });
  },

  async updateMealPlanItem(id: string, data: Partial<MealPlanItem>): Promise<MealPlanItem> {
    return request<MealPlanItem>(`/meal-plans/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async skipDay(date: string, skip: boolean): Promise<void> {
    return request('/meal-plans/skip-day', {
      method: 'POST',
      body: JSON.stringify({ date, skip }),
    });
  },

  // Monthly Recurring Schedule
  async getMonthlySchedule(year?: number, month?: number): Promise<{ items: MonthlyScheduleItem[]; days_in_month?: number }> {
    let endpoint = '/monthly-schedule';
    if (year && month) {
      endpoint += `?year=${year}&month=${month}`;
    }
    return request(endpoint);
  },

  async saveMonthlyScheduleItem(item: Partial<MonthlyScheduleItem>): Promise<MonthlyScheduleItem> {
    return request('/monthly-schedule', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  },

  async deleteMonthlyScheduleItem(id: string): Promise<void> {
    return request(`/monthly-schedule/${id}`, { method: 'DELETE' });
  },

  async autoDistributeSchedule(
    slot: string,
    year: number,
    month: number,
    groupId?: string
  ): Promise<{ assigned_count: number; items: MonthlyScheduleItem[] }> {
    return request('/monthly-schedule/auto-distribute', {
      method: 'POST',
      body: JSON.stringify({
        slot,
        year,
        month,
        group_id: groupId || '',
      }),
    });
  },

  // Meal Preparation (Atomic Inventory Deduction with Idempotency)
  async prepareMeal(mealPlanItemId: string, notes?: string) {
    const idempotency_key = generateUUID();
    return request('/meals/prepare', {
      method: 'POST',
      body: JSON.stringify({
        meal_plan_item_id: mealPlanItemId,
        idempotency_key,
        notes,
      }),
    });
  },

  async unprepareMeal(mealPlanItemId: string): Promise<any> {
    return request('/meals/unprepare', {
      method: 'POST',
      body: JSON.stringify({ meal_plan_item_id: mealPlanItemId }),
    });
  },

  // Shopping List
  async getActiveShoppingList(): Promise<ShoppingList> {
    return request<ShoppingList>('/shopping-lists/active');
  },

  async generateSmartShoppingList(startDate: string, endDate: string): Promise<ShoppingList> {
    return request<ShoppingList>('/shopping-lists/generate', {
      method: 'POST',
      body: JSON.stringify({ start_date: startDate, end_date: endDate }),
    });
  },

  async addShoppingItem(data: Partial<ShoppingItem>): Promise<ShoppingItem> {
    return request<ShoppingItem>('/shopping-lists/items', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async markShoppingItemBought(req: {
    shopping_item_id: string;
    bought_quantity: number;
    actual_price: number;
    add_to_inventory: boolean;
    vendor?: string;
    notes?: string;
  }): Promise<void> {
    return request('/shopping-lists/items/buy', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async deleteShoppingItem(id: string): Promise<void> {
    return request(`/shopping-lists/items/${id}`, { method: 'DELETE' });
  },

  async getPurchases(): Promise<Purchase[]> {
    return request<Purchase[]>('/purchases');
  },

  // Excel Endpoints
  async exportIngredientsExcel(): Promise<Blob> {
    const hid = getHouseholdId();
    const res = await fetch(`${API_BASE}/excel/export/ingredients?household_id=${encodeURIComponent(hid)}`, {
      headers: { 'X-Household-Id': hid },
    });
    if (!res.ok) throw new Error('فشل تصدير ملف إكسل للمكونات');
    return res.blob();
  },

  async exportRecipesExcel(): Promise<Blob> {
    const hid = getHouseholdId();
    const res = await fetch(`${API_BASE}/excel/export/recipes?household_id=${encodeURIComponent(hid)}`, {
      headers: { 'X-Household-Id': hid },
    });
    if (!res.ok) throw new Error('فشل تصدير ملف إكسل للوصفات');
    return res.blob();
  },

  async previewImportIngredientsExcel(file: File): Promise<IngredientImportPreviewItem[]> {
    const formData = new FormData();
    formData.append('file', file);
    const hid = getHouseholdId();
    const res = await fetch(`${API_BASE}/excel/import/ingredients/preview?household_id=${encodeURIComponent(hid)}`, {
      method: 'POST',
      headers: { 'X-Household-Id': hid },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'فشل قراءة ملف إكسل');
    }
    return res.json();
  },

  async commitImportIngredientsExcel(items: IngredientImportPreviewItem[]): Promise<{ message: string; imported_count: number }> {
    return request('/excel/import/ingredients/commit', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  // Reset entire system
  async resetSystem(pin: string): Promise<{ message: string }> {
    return request('/system/reset', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  },

  // Upload Image to persistent Volume
  async uploadImage(file: File): Promise<{ url: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const hid = getHouseholdId();
    const res = await fetch(`${API_BASE}/upload?household_id=${encodeURIComponent(hid)}`, {
      method: 'POST',
      headers: {
        'X-Household-Id': hid,
      },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'فشل رفع الصورة');
    }
    return data;
  },
};
