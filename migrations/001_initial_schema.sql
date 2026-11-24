-- Bayti Kitchen Database Migration: 001_initial_schema.sql
-- Compatible with PostgreSQL and SQLite

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(191) UNIQUE,
    name VARCHAR(191),
    password_hash VARCHAR(255),
    avatar_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS households (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(191) NOT NULL,
    currency VARCHAR(10) DEFAULT 'IQD',
    owner_user_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS units (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL,
    name_ar VARCHAR(64) NOT NULL,
    name_en VARCHAR(64),
    dimension VARCHAR(32) NOT NULL,
    factor_to_base DECIMAL(12,4) DEFAULT 1 NOT NULL,
    base_unit_code VARCHAR(32),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS ingredient_groups (
    id VARCHAR(64) PRIMARY KEY,
    household_id VARCHAR(64),
    name_ar VARCHAR(100) NOT NULL,
    name_en VARCHAR(100),
    icon VARCHAR(50) DEFAULT 'Package',
    color VARCHAR(30) DEFAULT '#3B82F6',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS ingredients (
    id VARCHAR(64) PRIMARY KEY,
    household_id VARCHAR(64),
    group_id VARCHAR(64),
    name_ar VARCHAR(191) NOT NULL,
    name_en VARCHAR(191),
    image_url VARCHAR(500),
    default_unit_id VARCHAR(64),
    unit_price DECIMAL(12,2) DEFAULT 0,
    min_stock DECIMAL(12,3) DEFAULT 0,
    density DECIMAL(10,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS inventories (
    id VARCHAR(64) PRIMARY KEY,
    household_id VARCHAR(64) NOT NULL,
    ingredient_id VARCHAR(64) UNIQUE NOT NULL,
    quantity DECIMAL(12,3) DEFAULT 0 NOT NULL,
    unit_id VARCHAR(64) NOT NULL,
    last_stock_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id VARCHAR(64) PRIMARY KEY,
    household_id VARCHAR(64) NOT NULL,
    ingredient_id VARCHAR(64) NOT NULL,
    type VARCHAR(32) NOT NULL,
    quantity_delta DECIMAL(12,3) NOT NULL,
    unit_id VARCHAR(64) NOT NULL,
    unit_price DECIMAL(12,2) DEFAULT 0,
    total_price DECIMAL(12,2) DEFAULT 0,
    reference_id VARCHAR(64),
    notes TEXT,
    idempotency_key VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS recipe_groups (
    id VARCHAR(64) PRIMARY KEY,
    household_id VARCHAR(64),
    name_ar VARCHAR(100) NOT NULL,
    name_en VARCHAR(100),
    icon VARCHAR(50) DEFAULT 'Utensils',
    color VARCHAR(30) DEFAULT '#10B981',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS recipes (
    id VARCHAR(64) PRIMARY KEY,
    household_id VARCHAR(64),
    group_id VARCHAR(64),
    name_ar VARCHAR(191) NOT NULL,
    name_en VARCHAR(191),
    image_url VARCHAR(500),
    description TEXT,
    instructions TEXT,
    servings INT DEFAULT 4 NOT NULL,
    prep_time_min INT DEFAULT 0,
    cook_time_min INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id VARCHAR(64) PRIMARY KEY,
    recipe_id VARCHAR(64) NOT NULL,
    ingredient_id VARCHAR(64) NOT NULL,
    quantity DECIMAL(12,3) NOT NULL,
    unit_id VARCHAR(64) NOT NULL,
    notes VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS meal_plans (
    id VARCHAR(64) PRIMARY KEY,
    household_id VARCHAR(64) NOT NULL,
    name VARCHAR(191),
    type VARCHAR(32) DEFAULT 'weekly',
    start_date VARCHAR(10) NOT NULL,
    end_date VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS meal_plan_items (
    id VARCHAR(64) PRIMARY KEY,
    meal_plan_id VARCHAR(64) NOT NULL,
    plan_date VARCHAR(10) NOT NULL,
    slot VARCHAR(32) NOT NULL,
    recipe_id VARCHAR(64) NOT NULL,
    servings INT DEFAULT 4 NOT NULL,
    is_skipped BOOLEAN DEFAULT FALSE,
    is_prepared BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS meal_preparations (
    id VARCHAR(64) PRIMARY KEY,
    household_id VARCHAR(64) NOT NULL,
    meal_plan_item_id VARCHAR(64) UNIQUE NOT NULL,
    recipe_id VARCHAR(64) NOT NULL,
    prepared_at TIMESTAMP WITH TIME ZONE NOT NULL,
    servings INT DEFAULT 4 NOT NULL,
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS shopping_lists (
    id VARCHAR(64) PRIMARY KEY,
    household_id VARCHAR(64) NOT NULL,
    title VARCHAR(191) NOT NULL,
    status VARCHAR(32) DEFAULT 'active',
    start_date VARCHAR(10),
    end_date VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS shopping_items (
    id VARCHAR(64) PRIMARY KEY,
    shopping_list_id VARCHAR(64) NOT NULL,
    ingredient_id VARCHAR(64) NOT NULL,
    required_quantity DECIMAL(12,3) NOT NULL,
    bought_quantity DECIMAL(12,3) DEFAULT 0,
    unit_id VARCHAR(64) NOT NULL,
    estimated_price DECIMAL(12,2) DEFAULT 0,
    actual_price DECIMAL(12,2) DEFAULT 0,
    is_bought BOOLEAN DEFAULT FALSE,
    added_to_inventory BOOLEAN DEFAULT FALSE,
    group_id VARCHAR(64),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS purchases (
    id VARCHAR(64) PRIMARY KEY,
    household_id VARCHAR(64) NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_amount DECIMAL(12,2) DEFAULT 0 NOT NULL,
    currency VARCHAR(10) DEFAULT 'IQD',
    vendor VARCHAR(191),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS purchase_items (
    id VARCHAR(64) PRIMARY KEY,
    purchase_id VARCHAR(64) NOT NULL,
    ingredient_id VARCHAR(64) NOT NULL,
    quantity DECIMAL(12,3) NOT NULL,
    unit_id VARCHAR(64) NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS sync_operations (
    id VARCHAR(64) PRIMARY KEY,
    household_id VARCHAR(64) NOT NULL,
    client_op_id VARCHAR(128) UNIQUE NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL,
    payload_json TEXT NOT NULL,
    client_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(32) DEFAULT 'applied',
    conflict_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS settings (
    id VARCHAR(64) PRIMARY KEY,
    household_id VARCHAR(64) NOT NULL,
    key VARCHAR(64) NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ingredients_name_ar ON ingredients(name_ar);
CREATE INDEX IF NOT EXISTS idx_recipes_name_ar ON recipes(name_ar);
CREATE INDEX IF NOT EXISTS idx_meal_plan_items_date ON meal_plan_items(plan_date);
CREATE INDEX IF NOT EXISTS idx_shopping_items_bought ON shopping_items(is_bought);
CREATE INDEX IF NOT EXISTS idx_inv_tx_idempotency ON inventory_transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_meal_prep_idempotency ON meal_preparations(idempotency_key);
