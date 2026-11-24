export type UnitDimension = 'mass' | 'volume' | 'count';

export interface Unit {
  id: string;
  code: string;
  name_ar: string;
  name_en?: string;
  dimension: UnitDimension;
  factor_to_base: number;
  base_unit_code: string;
}

export interface IngredientGroup {
  id: string;
  household_id?: string;
  name_ar: string;
  name_en?: string;
  icon?: string;
  color?: string;
  sort_order?: number;
}

export interface Inventory {
  id: string;
  household_id: string;
  ingredient_id: string;
  quantity: number;
  unit_id: string;
  unit?: Unit;
  last_stock_at?: string;
}

export interface Ingredient {
  id: string;
  household_id?: string;
  group_id?: string;
  group?: IngredientGroup;
  name_ar: string;
  name_en?: string;
  image_url?: string;
  default_unit_id: string;
  default_unit?: Unit;
  unit_price: number;
  min_stock?: number;
  minStock?: number;
  density: number;
  inventory?: Inventory;
}

export interface RecipeGroup {
  id: string;
  name_ar: string;
  name_en?: string;
  icon?: string;
  color?: string;
}

export interface RecipeIngredient {
  id?: string;
  recipe_id?: string;
  ingredient_id: string;
  ingredient?: Ingredient;
  quantity: number;
  unit_id: string;
  unit?: Unit;
  notes?: string;
  in_stock_quantity?: number;
  in_stock_unit?: string;
  is_missing?: boolean;
  missing_amount?: number;
}

export interface Recipe {
  id: string;
  household_id?: string;
  group_id?: string;
  group?: RecipeGroup;
  name_ar: string;
  name_en?: string;
  image_url?: string;
  description?: string;
  instructions?: string;
  servings: number;
  prep_time_min?: number;
  cook_time_min?: number;
  ingredients: RecipeIngredient[];
  total_cost?: number;
  cost_per_serving?: number;
  is_available?: boolean;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealPlanItem {
  id: string;
  meal_plan_id?: string;
  plan_date: string; // YYYY-MM-DD
  slot: MealSlot;
  recipe_id: string;
  recipe?: Recipe;
  servings: number;
  is_skipped: boolean;
  is_prepared: boolean;
  sort_order?: number;
  notes?: string;
  available_count?: number;
  total_count?: number;
  total_cost?: number;
}

export interface MonthlyScheduleItem {
  id: string;
  household_id?: string;
  day_of_month: number; // 1 to 31
  slot: MealSlot;
  recipe_id: string;
  recipe?: Recipe;
  servings: number;
  is_skipped?: boolean;
  is_prepared?: boolean;
  notes?: string;
}

export interface ShoppingItem {
  id: string;
  shopping_list_id?: string;
  ingredient_id: string;
  ingredient?: Ingredient;
  required_quantity: number;
  requiredQuantity?: number;
  bought_quantity: number;
  boughtQuantity?: number;
  unit_id: string;
  unit?: Unit;
  estimated_price: number;
  estimatedPrice?: number;
  actual_price: number;
  actualPrice?: number;
  is_bought: boolean;
  isBought?: boolean;
  added_to_inventory: boolean;
  addedToInventory?: boolean;
  group_id?: string;
  group?: IngredientGroup;
  notes?: string;
}

export interface ShoppingList {
  id: string;
  household_id?: string;
  title: string;
  status: 'active' | 'completed' | 'archived';
  start_date?: string;
  end_date?: string;
  items: ShoppingItem[];
  total_est_cost?: number;
  total_act_cost?: number;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  ingredient_id: string;
  ingredient?: Ingredient;
  quantity: number;
  unit_id: string;
  unit?: Unit;
  unit_price: number;
  total_price: number;
}

export interface Purchase {
  id: string;
  household_id: string;
  date: string;
  total_amount: number;
  currency: string;
  vendor?: string;
  notes?: string;
  items?: PurchaseItem[];
}

export interface SyncOperation {
  client_op_id: string;
  household_id?: string;
  entity_type: string;
  entity_id: string;
  action: 'create' | 'update' | 'delete';
  payload_json: string;
  client_time: string;
}

export interface IngredientImportPreviewItem {
  name_ar: string;
  name_en: string;
  group_name: string;
  unit_code: string;
  unit_price: number;
  min_stock: number;
  initial_qty: number;
  density: number;
  is_existing: boolean;
  status: 'new' | 'update' | 'invalid';
  error?: string;
}
