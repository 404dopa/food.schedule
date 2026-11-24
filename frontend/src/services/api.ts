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
import { getDB, queueOfflineOperation, getQueuedOperations, clearQueuedOperation } from './db';
import { getHouseholdId } from './session';

const getApiBase = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && window.location) {
    // When running deployed online (e.g. on Railway or any domain), use the same origin
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

// Check network connectivity
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// Append household_id to a query string
function withHousehold(endpoint: string): string {
  const hid = getHouseholdId();
  const sep = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${sep}household_id=${encodeURIComponent(hid)}`;
}

// Helper fetch wrapper — automatically appends household_id to every request
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${withHousehold(endpoint)}`;
  const res = await fetch(url, {
    ...options,
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
    try {
      const data = await request<Unit[]>('/units');
      const db = await getDB();
      const tx = db.transaction('units', 'readwrite');
      for (const u of data) {
        tx.store.put(u);
      }
      await tx.done;
      return data;
    } catch (e) {
      const db = await getDB();
      return db.getAll('units');
    }
  },

  // Groups
  async getIngredientGroups(): Promise<IngredientGroup[]> {
    try {
      const data = await request<IngredientGroup[]>('/ingredient-groups');
      const db = await getDB();
      await db.clear('ingredient_groups');
      const tx = db.transaction('ingredient_groups', 'readwrite');
      for (const g of data) {
        tx.store.put(g);
      }
      await tx.done;
      return data;
    } catch (e) {
      const db = await getDB();
      return db.getAll('ingredient_groups');
    }
  },

  async createIngredientGroup(nameAr: string): Promise<IngredientGroup> {
    const data = await request<IngredientGroup>('/ingredient-groups', {
      method: 'POST',
      body: JSON.stringify({ name_ar: nameAr }),
    });
    try {
      const db = await getDB();
      await db.put('ingredient_groups', data);
    } catch (e) {
      console.warn('Failed to cache ingredient group in IndexedDB', e);
    }
    return data;
  },

  async deleteIngredientGroup(id: string): Promise<void> {
    await request(`/ingredient-groups/${id}`, {
      method: 'DELETE',
    });
    try {
      const db = await getDB();
      await db.delete('ingredient_groups', id);
    } catch (e) {
      console.warn('Failed to delete ingredient group from IndexedDB', e);
    }
  },

  // Ingredients
  async getIngredients(groupId?: string, search?: string): Promise<Ingredient[]> {
    try {
      let endpoint = '/ingredients?';
      if (groupId) endpoint += `group_id=${groupId}&`;
      if (search) endpoint += `search=${encodeURIComponent(search)}&`;
      const data = await request<Ingredient[]>(endpoint);
      const db = await getDB();
      if (!groupId && !search) {
        await db.clear('ingredients');
      }
      const tx = db.transaction('ingredients', 'readwrite');
      for (const item of data) {
        tx.store.put(item);
      }
      await tx.done;
      return data;
    } catch (e) {
      const db = await getDB();
      let list = await db.getAll('ingredients');
      if (groupId) {
        list = list.filter((i) => i.group_id === groupId);
      }
      if (search) {
        const s = search.toLowerCase();
        list = list.filter((i) => i.name_ar.toLowerCase().includes(s) || (i.name_en && i.name_en.toLowerCase().includes(s)));
      }
      return list;
    }
  },

  async createIngredient(data: Partial<Ingredient> & { initial_quantity?: number }): Promise<Ingredient> {
    const id = data.id || generateUUID();
    const payload = { ...data, id };

    try {
      const res = await request<Ingredient>('/ingredients', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const db = await getDB();
      await db.put('ingredients', res);
      return res;
    } catch (e) {
      // Offline fallback: save locally and queue operation
      const db = await getDB();
      const fallbackItem = payload as Ingredient;
      await db.put('ingredients', fallbackItem);
      await queueOfflineOperation({
        client_op_id: generateUUID(),
        entity_type: 'ingredient',
        entity_id: id,
        action: 'create',
        payload_json: JSON.stringify(payload),
        client_time: new Date().toISOString(),
      });
      return fallbackItem;
    }
  },

  async updateIngredient(id: string, data: Partial<Ingredient>): Promise<Ingredient> {
    try {
      const res = await request<Ingredient>(`/ingredients/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      const db = await getDB();
      await db.put('ingredients', res);
      return res;
    } catch (e) {
      const db = await getDB();
      const existing = await db.get('ingredients', id);
      const updated = { ...existing, ...data } as Ingredient;
      await db.put('ingredients', updated);
      await queueOfflineOperation({
        client_op_id: generateUUID(),
        entity_type: 'ingredient',
        entity_id: id,
        action: 'update',
        payload_json: JSON.stringify(updated),
        client_time: new Date().toISOString(),
      });
      return updated;
    }
  },

  async deleteIngredient(id: string): Promise<void> {
    try {
      await request(`/ingredients/${id}`, { method: 'DELETE' });
    } catch (e) {
      await queueOfflineOperation({
        client_op_id: generateUUID(),
        entity_type: 'ingredient',
        entity_id: id,
        action: 'delete',
        payload_json: '{}',
        client_time: new Date().toISOString(),
      });
    }
    const db = await getDB();
    await db.delete('ingredients', id);
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
    try {
      const data = await request<RecipeGroup[]>('/recipe-groups');
      const db = await getDB();
      await db.clear('recipe_groups');
      const tx = db.transaction('recipe_groups', 'readwrite');
      for (const g of data) {
        tx.store.put(g);
      }
      await tx.done;
      return data;
    } catch (e) {
      const db = await getDB();
      return db.getAll('recipe_groups');
    }
  },

  async createRecipeGroup(nameAr: string): Promise<RecipeGroup> {
    const data = await request<RecipeGroup>('/recipe-groups', {
      method: 'POST',
      body: JSON.stringify({ name_ar: nameAr }),
    });
    try {
      const db = await getDB();
      await db.put('recipe_groups', data);
    } catch (e) {
      console.warn('Failed to cache recipe group in IndexedDB', e);
    }
    return data;
  },

  async deleteRecipeGroup(id: string): Promise<void> {
    await request(`/recipe-groups/${id}`, {
      method: 'DELETE',
    });
    try {
      const db = await getDB();
      await db.delete('recipe_groups', id);
    } catch (e) {
      console.warn('Failed to delete recipe group from IndexedDB', e);
    }
  },

  // Recipes
  async getRecipes(groupId?: string, search?: string): Promise<Recipe[]> {
    try {
      let endpoint = '/recipes?';
      if (groupId) endpoint += `group_id=${groupId}&`;
      if (search) endpoint += `search=${encodeURIComponent(search)}&`;
      const data = await request<Recipe[]>(endpoint);
      const db = await getDB();
      if (!groupId && !search) {
        await db.clear('recipes');
      }
      const tx = db.transaction('recipes', 'readwrite');
      for (const item of data) {
        tx.store.put(item);
      }
      await tx.done;
      return data;
    } catch (e) {
      const db = await getDB();
      let list = await db.getAll('recipes');
      if (groupId) {
        list = list.filter((r) => r.group_id === groupId);
      }
      if (search) {
        const s = search.toLowerCase();
        list = list.filter((r) => r.name_ar.toLowerCase().includes(s) || (r.name_en && r.name_en.toLowerCase().includes(s)));
      }
      return list;
    }
  },

  async createRecipe(data: Partial<Recipe>): Promise<Recipe> {
    const id = data.id || generateUUID();
    const payload = { ...data, id };
    try {
      const res = await request<Recipe>('/recipes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const db = await getDB();
      await db.put('recipes', res);
      return res;
    } catch (e) {
      const db = await getDB();
      const item = payload as Recipe;
      await db.put('recipes', item);
      await queueOfflineOperation({
        client_op_id: generateUUID(),
        entity_type: 'recipe',
        entity_id: id,
        action: 'create',
        payload_json: JSON.stringify(payload),
        client_time: new Date().toISOString(),
      });
      return item;
    }
  },

  async updateRecipe(id: string, data: Partial<Recipe>): Promise<Recipe> {
    try {
      const res = await request<Recipe>(`/recipes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      const db = await getDB();
      await db.put('recipes', res);
      return res;
    } catch (e) {
      const db = await getDB();
      const existing = await db.get('recipes', id);
      const updated = { ...existing, ...data } as Recipe;
      await db.put('recipes', updated);
      await queueOfflineOperation({
        client_op_id: generateUUID(),
        entity_type: 'recipe',
        entity_id: id,
        action: 'update',
        payload_json: JSON.stringify(updated),
        client_time: new Date().toISOString(),
      });
      return updated;
    }
  },

  async deleteRecipe(id: string): Promise<void> {
    try {
      await request(`/recipes/${id}`, { method: 'DELETE' });
    } catch (e) {
      await queueOfflineOperation({
        client_op_id: generateUUID(),
        entity_type: 'recipe',
        entity_id: id,
        action: 'delete',
        payload_json: '{}',
        client_time: new Date().toISOString(),
      });
    }
    const db = await getDB();
    await db.delete('recipes', id);
    try {
      const mealItems = await db.getAll('meal_plan_items');
      for (const it of mealItems) {
        if (it.recipe_id === id) {
          await db.delete('meal_plan_items', it.id);
        }
      }
    } catch (e) {
      // ignore
    }
  },

  async duplicateRecipe(id: string, nameAr?: string): Promise<Recipe> {
    return request<Recipe>(`/recipes/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name_ar: nameAr }),
    });
  },

  // Meal Plans
  async getMealPlans(startDate: string, endDate: string): Promise<MealPlanItem[]> {
    try {
      const data = await request<MealPlanItem[]>(`/meal-plans?start_date=${startDate}&end_date=${endDate}`);
      const db = await getDB();
      const allCached = await db.getAll('meal_plan_items');
      const tx = db.transaction('meal_plan_items', 'readwrite');
      for (const oldItem of allCached) {
        if (oldItem.plan_date >= startDate && oldItem.plan_date <= endDate) {
          tx.store.delete(oldItem.id);
        }
      }
      for (const item of data) {
        tx.store.put(item);
      }
      await tx.done;
      return data;
    } catch (e) {
      const db = await getDB();
      return db.getAll('meal_plan_items');
    }
  },

  async addMealPlanItem(data: Partial<MealPlanItem>): Promise<MealPlanItem> {
    const id = data.id || generateUUID();
    const payload = { ...data, id };
    try {
      const res = await request<MealPlanItem>('/meal-plans/items', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const db = await getDB();
      await db.put('meal_plan_items', res);
      return res;
    } catch (e) {
      const db = await getDB();
      const item = payload as MealPlanItem;
      await db.put('meal_plan_items', item);
      await queueOfflineOperation({
        client_op_id: generateUUID(),
        entity_type: 'meal_plan_item',
        entity_id: id,
        action: 'create',
        payload_json: JSON.stringify(payload),
        client_time: new Date().toISOString(),
      });
      return item;
    }
  },

  async deleteMealPlanItem(id: string): Promise<void> {
    try {
      await request(`/meal-plans/items/${id}`, { method: 'DELETE' });
    } catch (e) {
      await queueOfflineOperation({
        client_op_id: generateUUID(),
        entity_type: 'meal_plan_item',
        entity_id: id,
        action: 'delete',
        payload_json: '{}',
        client_time: new Date().toISOString(),
      });
    }
    const db = await getDB();
    await db.delete('meal_plan_items', id);
  },

  async updateMealPlanItem(id: string, data: Partial<MealPlanItem>): Promise<MealPlanItem> {
    try {
      const res = await request<MealPlanItem>(`/meal-plans/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      const db = await getDB();
      await db.put('meal_plan_items', res);
      return res;
    } catch (e) {
      const db = await getDB();
      const existing = await db.get('meal_plan_items', id);
      const updated = { ...existing, ...data } as MealPlanItem;
      await db.put('meal_plan_items', updated);
      await queueOfflineOperation({
        client_op_id: generateUUID(),
        entity_type: 'meal_plan_item',
        entity_id: id,
        action: 'update',
        payload_json: JSON.stringify(data),
        client_time: new Date().toISOString(),
      });
      return updated;
    }
  },

  async skipDay(date: string, skip: boolean): Promise<void> {
    return request('/meal-plans/skip-day', {
      method: 'POST',
      body: JSON.stringify({ date, skip }),
    });
  },

  // Monthly Recurring Schedule (الجدول الشهري المتكرر)
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

  // CRITICAL: Meal Preparation (Atomic Inventory Deduction with Idempotency)
  async prepareMeal(mealPlanItemId: string, notes?: string) {
    const idempotencyKey = generateUUID();
    return request('/meals/prepare', {
      method: 'POST',
      body: JSON.stringify({
        meal_plan_item_id: mealPlanItemId,
        idempotency_key: idempotencyKey,
        notes,
      }),
    });
  },

  async unprepareMeal(mealPlanItemId: string): Promise<any> {
    try {
      const res = await request('/meals/unprepare', {
        method: 'POST',
        body: JSON.stringify({ meal_plan_item_id: mealPlanItemId }),
      });
      const db = await getDB();
      const item = await db.get('meal_plan_items', mealPlanItemId);
      if (item) {
        item.is_prepared = false;
        await db.put('meal_plan_items', item);
      }
      return res;
    } catch (e) {
      const db = await getDB();
      const item = await db.get('meal_plan_items', mealPlanItemId);
      if (item) {
        item.is_prepared = false;
        await db.put('meal_plan_items', item);
      }
      await queueOfflineOperation({
        client_op_id: generateUUID(),
        entity_type: 'meal_plan_item',
        entity_id: mealPlanItemId,
        action: 'update',
        payload_json: JSON.stringify({ meal_plan_item_id: mealPlanItemId, is_prepared: false }),
        client_time: new Date().toISOString(),
      });
      return { success: true };
    }
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
    const res = await fetch(`${API_BASE}/excel/export/ingredients`);
    if (!res.ok) throw new Error('فشل تصدير ملف إكسل للمكونات');
    return res.blob();
  },

  async exportRecipesExcel(): Promise<Blob> {
    const res = await fetch(`${API_BASE}/excel/export/recipes`);
    if (!res.ok) throw new Error('فشل تصدير ملف إكسل للوصفات');
    return res.blob();
  },

  async previewImportIngredientsExcel(file: File): Promise<IngredientImportPreviewItem[]> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/excel/import/ingredients/preview`, {
      method: 'POST',
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

  // Sync Engine: flush queued offline operations
  async syncOfflineQueue(): Promise<{ success: number; skipped: number; errors: string[] }> {
    const queue = await getQueuedOperations();
    if (queue.length === 0) {
      return { success: 0, skipped: 0, errors: [] };
    }

    const payload = {
      household_id: getHouseholdId(),
      operations: queue,
    };

    const res = await request<{
      success_count: number;
      skipped_count: number;
      error_count: number;
      errors: string[];
    }>('/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    // Remove processed operations
    for (const op of queue) {
      await clearQueuedOperation(op.client_op_id);
    }

    return {
      success: res.success_count,
      skipped: res.skipped_count,
      errors: res.errors || [],
    };
  },

  // Reset entire system (groups, ingredients, recipes, schedules, inventory, transactions)
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
