# Bayti Kitchen REST API Specification

Base URL: `/api`

### Health Check
- `GET /health` - Service health status

### 1. Ingredients & Kitchen Inventory
- `GET /api/units` - List all measurement units
- `GET /api/ingredient-groups` - List ingredient categories
- `POST /api/ingredient-groups` - Create new group
- `GET /api/ingredients?group_id=&search=` - List ingredients with stock & pricing
- `POST /api/ingredients` - Create ingredient with initial stock
- `PUT /api/ingredients/:id` - Update ingredient
- `DELETE /api/ingredients/:id` - Delete ingredient
- `GET /api/inventory?status=low|out|ok` - Get inventory status
- `POST /api/inventory/adjust` - Adjust stock (+ / -) with transaction reason & idempotency key
- `GET /api/inventory/transactions?ingredient_id=` - Get stock movement log

### 2. Recipes
- `GET /api/recipe-groups` - List recipe categories
- `POST /api/recipe-groups` - Create recipe group
- `GET /api/recipes?group_id=&search=` - List enriched recipes with cost & stock status
- `GET /api/recipes/:id` - Get recipe by ID with ingredients & missing status
- `POST /api/recipes` - Create new recipe
- `PUT /api/recipes/:id` - Update recipe
- `DELETE /api/recipes/:id` - Delete recipe
- `POST /api/recipes/:id/duplicate` - Clone recipe

### 3. Meal Plans & Preparation
- `GET /api/meal-plans?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` - Get meal schedule
- `POST /api/meal-plans/items` - Add meal item
- `PUT /api/meal-plans/items/:id` - Update meal item
- `DELETE /api/meal-plans/items/:id` - Remove meal item
- `POST /api/meal-plans/skip-day` - Skip entire day
- `POST /api/meal-plans/copy-week` - Copy previous week's meal plan
- `POST /api/meals/prepare` - **Critical meal preparation endpoint:**
  ```json
  {
    "meal_plan_item_id": "uuid",
    "idempotency_key": "uuid",
    "notes": "optional"
  }
  ```

### 4. Smart Shopping & Purchases
- `GET /api/shopping-lists/active` - Get active shopping list
- `POST /api/shopping-lists/generate` - Generate smart shopping list based on meal deficit
- `POST /api/shopping-lists/items` - Add item manually
- `POST /api/shopping-lists/items/buy` - Mark item bought & credit to inventory
- `DELETE /api/shopping-lists/items/:id` - Remove shopping item
- `GET /api/purchases` - List purchase history and expenses

### 5. Offline Sync
- `POST /api/sync` - Process batch of queued offline operations with idempotency

### 6. Excel Import & Export
- `GET /api/excel/export/ingredients` - Download ingredients `.xlsx`
- `GET /api/excel/export/recipes` - Download recipes `.xlsx`
- `POST /api/excel/import/ingredients/preview` - Upload `.xlsx` and receive preview
- `POST /api/excel/import/ingredients/commit` - Commit imported items into database
