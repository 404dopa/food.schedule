import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  Ingredient,
  IngredientGroup,
  Recipe,
  RecipeGroup,
  MealPlanItem,
  ShoppingItem,
  Unit,
  SyncOperation,
} from '../types';

interface BaytiDB extends DBSchema {
  ingredients: {
    key: string;
    value: Ingredient;
  };
  ingredient_groups: {
    key: string;
    value: IngredientGroup;
  };
  recipes: {
    key: string;
    value: Recipe;
  };
  recipe_groups: {
    key: string;
    value: RecipeGroup;
  };
  meal_plan_items: {
    key: string;
    value: MealPlanItem;
    indexes: { 'by-date': string };
  };
  shopping_items: {
    key: string;
    value: ShoppingItem;
  };
  units: {
    key: string;
    value: Unit;
  };
  sync_queue: {
    key: string;
    value: SyncOperation;
  };
}

const DB_NAME = 'bayti_kitchen_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<BaytiDB>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<BaytiDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('ingredients')) {
          db.createObjectStore('ingredients', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('ingredient_groups')) {
          db.createObjectStore('ingredient_groups', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('recipes')) {
          db.createObjectStore('recipes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('recipe_groups')) {
          db.createObjectStore('recipe_groups', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meal_plan_items')) {
          const store = db.createObjectStore('meal_plan_items', { keyPath: 'id' });
          store.createIndex('by-date', 'plan_date');
        }
        if (!db.objectStoreNames.contains('shopping_items')) {
          db.createObjectStore('shopping_items', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('units')) {
          db.createObjectStore('units', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          db.createObjectStore('sync_queue', { keyPath: 'client_op_id' });
        }
      },
    });
  }
  return dbPromise;
}

// Offline Queue Operations
export async function queueOfflineOperation(op: SyncOperation): Promise<void> {
  const db = await getDB();
  await db.put('sync_queue', op);
}

export async function getQueuedOperations(): Promise<SyncOperation[]> {
  const db = await getDB();
  return db.getAll('sync_queue');
}

export async function clearQueuedOperation(clientOpId: string): Promise<void> {
  const db = await getDB();
  await db.delete('sync_queue', clientOpId);
}

// Clear all locally cached offline entities and queue upon system reset
export async function clearAllLocalData(): Promise<void> {
  try {
    const db = await getDB();
    const stores = [
      'ingredients',
      'ingredient_groups',
      'recipes',
      'recipe_groups',
      'meal_plan_items',
      'shopping_items',
      'sync_queue',
    ] as const;

    for (const store of stores) {
      if (db.objectStoreNames.contains(store)) {
        await db.clear(store);
      }
    }
  } catch (e) {
    console.warn('Failed to clear local IndexedDB tables:', e);
  }
}
