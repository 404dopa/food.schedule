package models

import (
	"time"

	"gorm.io/gorm"
)

// Base model with UUID string primary key and timestamps
type BaseModel struct {
	ID        string         `gorm:"primaryKey;type:varchar(64)" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

type User struct {
	BaseModel
	Email        string `gorm:"uniqueIndex;type:varchar(191)" json:"email"`
	Name         string `gorm:"type:varchar(191)" json:"name"`
	PasswordHash string `gorm:"type:varchar(255)" json:"-"`
	AvatarURL    string `gorm:"type:varchar(255)" json:"avatar_url"`
}

type Household struct {
	BaseModel
	Name        string `gorm:"type:varchar(191);not null" json:"name"`
	Currency    string `gorm:"type:varchar(10);default:'IQD'" json:"currency"`
	OwnerUserID string `gorm:"type:varchar(64);index" json:"owner_user_id"`
}

type HouseholdMember struct {
	BaseModel
	HouseholdID string `gorm:"type:varchar(64);index;not null" json:"household_id"`
	UserID      string `gorm:"type:varchar(64);index;not null" json:"user_id"`
	Role        string `gorm:"type:varchar(32);default:'admin'" json:"role"` // admin, member
}

type UnitDimension string

const (
	DimensionMass   UnitDimension = "mass"   // kg, g
	DimensionVolume UnitDimension = "volume" // l, ml
	DimensionCount  UnitDimension = "count"  // piece, pack, can
)

type Unit struct {
	BaseModel
	Code             string        `gorm:"uniqueIndex;type:varchar(32);not null" json:"code"` // kg, g, l, ml, piece, pack, can
	NameAr           string        `gorm:"type:varchar(64);not null" json:"name_ar"`         // كغم، غم، لتر، مل، حبة، كيس، علبة
	NameEn           string        `gorm:"type:varchar(64)" json:"name_en"`
	Dimension        UnitDimension `gorm:"type:varchar(32);not null" json:"dimension"` // mass, volume, count
	FactorToBase     float64       `gorm:"type:decimal(12,4);not null;default:1" json:"factor_to_base"` // e.g. 1 kg = 1000 g, 1 l = 1000 ml
	BaseUnitCode     string        `gorm:"type:varchar(32)" json:"base_unit_code"` // e.g. "g" for kg/g, "ml" for l/ml, "piece" for count
}

type IngredientGroup struct {
	BaseModel
	HouseholdID string `gorm:"type:varchar(64);index" json:"household_id"`
	NameAr      string `gorm:"type:varchar(100);not null" json:"name_ar"`
	NameEn      string `gorm:"type:varchar(100)" json:"name_en"`
	Icon        string `gorm:"type:varchar(50);default:'Package'" json:"icon"`
	Color       string `gorm:"type:varchar(30);default:'#3B82F6'" json:"color"`
	SortOrder   int    `gorm:"default:0" json:"sort_order"`
}

type Ingredient struct {
	BaseModel
	HouseholdID   string           `gorm:"type:varchar(64);index" json:"household_id"`
	GroupID       string           `gorm:"type:varchar(64);index" json:"group_id"`
	Group         *IngredientGroup `gorm:"foreignKey:GroupID" json:"group,omitempty"`
	NameAr        string           `gorm:"type:varchar(191);not null;index" json:"name_ar"`
	NameEn        string           `gorm:"type:varchar(191)" json:"name_en"`
	ImageURL      string           `gorm:"type:text" json:"image_url"`
	DefaultUnitID string           `gorm:"type:varchar(64)" json:"default_unit_id"`
	DefaultUnit   *Unit            `gorm:"foreignKey:DefaultUnitID" json:"default_unit,omitempty"`
	UnitPrice     float64          `gorm:"type:decimal(12,2);default:0" json:"unit_price"` // Price per default unit in IQD
	MinStock      float64          `gorm:"type:decimal(12,3);default:0" json:"min_stock"`
	Density       float64          `gorm:"type:decimal(10,4);default:0" json:"density"` // g/ml, 0 if unknown
	Inventory     *Inventory       `gorm:"foreignKey:IngredientID" json:"inventory,omitempty"`
}

type Inventory struct {
	BaseModel
	HouseholdID  string      `gorm:"type:varchar(64);index;not null" json:"household_id"`
	IngredientID string      `gorm:"type:varchar(64);uniqueIndex;not null" json:"ingredient_id"`
	Ingredient   *Ingredient `gorm:"foreignKey:IngredientID" json:"ingredient,omitempty"`
	Quantity     float64     `gorm:"type:decimal(12,3);not null;default:0" json:"quantity"` // in ingredient's default unit
	UnitID       string      `gorm:"type:varchar(64);not null" json:"unit_id"`
	Unit         *Unit       `gorm:"foreignKey:UnitID" json:"unit,omitempty"`
	LastStockAt  time.Time   `json:"last_stock_at"`
}

type TransactionType string

const (
	TxTypePurchase    TransactionType = "purchase"
	TxTypeConsumption TransactionType = "consumption" // Meal preparation
	TxTypeAdjustment  TransactionType = "adjustment"  // Manual correction
	TxTypeWaste       TransactionType = "waste"
)

type InventoryTransaction struct {
	BaseModel
	HouseholdID   string          `gorm:"type:varchar(64);index;not null" json:"household_id"`
	IngredientID  string          `gorm:"type:varchar(64);index;not null" json:"ingredient_id"`
	Ingredient    *Ingredient     `gorm:"foreignKey:IngredientID" json:"ingredient,omitempty"`
	Type          TransactionType `gorm:"type:varchar(32);not null" json:"type"`
	QuantityDelta float64         `gorm:"type:decimal(12,3);not null" json:"quantity_delta"` // Negative for consumption/waste, positive for purchase
	UnitID        string          `gorm:"type:varchar(64);not null" json:"unit_id"`
	Unit          *Unit           `gorm:"foreignKey:UnitID" json:"unit,omitempty"`
	UnitPrice     float64         `gorm:"type:decimal(12,2);default:0" json:"unit_price"`
	TotalPrice    float64         `gorm:"type:decimal(12,2);default:0" json:"total_price"`
	ReferenceID   string          `gorm:"type:varchar(64);index" json:"reference_id"` // e.g. preparation_id or purchase_id
	Notes         string          `gorm:"type:text" json:"notes"`
	IdempotencyKey string         `gorm:"type:varchar(128);index" json:"idempotency_key"`
}

type RecipeGroup struct {
	BaseModel
	HouseholdID string `gorm:"type:varchar(64);index" json:"household_id"`
	NameAr      string `gorm:"type:varchar(100);not null" json:"name_ar"`
	NameEn      string `gorm:"type:varchar(100)" json:"name_en"`
	Icon        string `gorm:"type:varchar(50);default:'Utensils'" json:"icon"`
	Color       string `gorm:"type:varchar(30);default:'#10B981'" json:"color"`
}

type Recipe struct {
	BaseModel
	HouseholdID  string             `gorm:"type:varchar(64);index" json:"household_id"`
	GroupID      string             `gorm:"type:varchar(64);index" json:"group_id"`
	Group        *RecipeGroup       `gorm:"foreignKey:GroupID" json:"group,omitempty"`
	NameAr       string             `gorm:"type:varchar(191);not null;index" json:"name_ar"`
	NameEn       string             `gorm:"type:varchar(191)" json:"name_en"`
	ImageURL     string             `gorm:"type:text" json:"image_url"`
	Description  string             `gorm:"type:text" json:"description"`
	Instructions string             `gorm:"type:text" json:"instructions"`
	Servings     int                `gorm:"not null;default:0" json:"servings"`
	PrepTimeMin  int                `gorm:"default:0" json:"prep_time_min"`
	CookTimeMin  int                `gorm:"default:0" json:"cook_time_min"`
	ForBreakfast bool               `gorm:"default:false" json:"for_breakfast"`
	ForLunch     bool               `gorm:"default:false" json:"for_lunch"`
	ForDinner    bool               `gorm:"default:false" json:"for_dinner"`
	ForSnack     bool               `gorm:"default:false" json:"for_snack"`
	Ingredients  []RecipeIngredient `gorm:"foreignKey:RecipeID" json:"ingredients,omitempty"`
	TotalCost    float64            `gorm:"-" json:"total_cost"` // Computed field
	CostPerServe float64            `gorm:"-" json:"cost_per_serving"`
	IsAvailable  bool               `gorm:"-" json:"is_available"` // True if all ingredients present in inventory
}

type RecipeIngredient struct {
	BaseModel
	RecipeID     string      `gorm:"type:varchar(64);index;not null" json:"recipe_id"`
	IngredientID string      `gorm:"type:varchar(64);index;not null" json:"ingredient_id"`
	Ingredient   *Ingredient `gorm:"foreignKey:IngredientID" json:"ingredient,omitempty"`
	Quantity     float64     `gorm:"type:decimal(12,3);not null" json:"quantity"`
	UnitID       string      `gorm:"type:varchar(64);not null" json:"unit_id"`
	Unit         *Unit       `gorm:"foreignKey:UnitID" json:"unit,omitempty"`
	Notes        string      `gorm:"type:varchar(255)" json:"notes"`
	// Calculation helpers returned by API
	InStockQuantity float64 `gorm:"-" json:"in_stock_quantity"`
	InStockUnit     string  `gorm:"-" json:"in_stock_unit"`
	IsMissing       bool    `gorm:"-" json:"is_missing"`
	MissingAmount   float64 `gorm:"-" json:"missing_amount"`
}

type MealPlanType string

const (
	PlanDaily   MealPlanType = "daily"
	PlanWeekly  MealPlanType = "weekly"
	PlanMonthly MealPlanType = "monthly"
)

type MealPlan struct {
	BaseModel
	HouseholdID string         `gorm:"type:varchar(64);index;not null" json:"household_id"`
	Name        string         `gorm:"type:varchar(191)" json:"name"`
	Type        MealPlanType   `gorm:"type:varchar(32);default:'weekly'" json:"type"`
	StartDate   string         `gorm:"type:varchar(10);not null;index" json:"start_date"` // YYYY-MM-DD
	EndDate     string         `gorm:"type:varchar(10);not null;index" json:"end_date"`   // YYYY-MM-DD
	Items       []MealPlanItem `gorm:"foreignKey:MealPlanID" json:"items,omitempty"`
}

type MealSlot string

const (
	MealBreakfast MealSlot = "breakfast" // فطور
	MealLunch     MealSlot = "lunch"     // غداء
	MealDinner    MealSlot = "dinner"    // عشاء
	MealSnack     MealSlot = "snack"     // وجبة إضافية / سناك
)

type MealPlanItem struct {
	BaseModel
	MealPlanID   string           `gorm:"type:varchar(64);index;not null" json:"meal_plan_id"`
	PlanDate     string           `gorm:"type:varchar(10);not null;index" json:"plan_date"` // YYYY-MM-DD
	Slot         MealSlot         `gorm:"type:varchar(32);not null" json:"slot"`
	RecipeID     string           `gorm:"type:varchar(64);index;not null" json:"recipe_id"`
	Recipe       *Recipe          `gorm:"foreignKey:RecipeID" json:"recipe,omitempty"`
	Servings     int              `gorm:"not null;default:4" json:"servings"`
	IsSkipped    bool             `gorm:"default:false" json:"is_skipped"`
	IsPrepared   bool             `gorm:"default:false" json:"is_prepared"`
	Preparation  *MealPreparation `gorm:"foreignKey:MealPlanItemID" json:"preparation,omitempty"`
	SortOrder    int              `gorm:"default:0" json:"sort_order"`
	Notes        string           `gorm:"type:text" json:"notes"`
	// Computed helpers for Daily Dashboard
	AvailableCount int     `gorm:"-" json:"available_count"`
	TotalCount     int     `gorm:"-" json:"total_count"`
	TotalCost      float64 `gorm:"-" json:"total_cost"`
}

type MealPreparation struct {
	BaseModel
	HouseholdID    string    `gorm:"type:varchar(64);index;not null" json:"household_id"`
	MealPlanItemID string    `gorm:"type:varchar(64);uniqueIndex;not null" json:"meal_plan_item_id"`
	RecipeID       string    `gorm:"type:varchar(64);index;not null" json:"recipe_id"`
	Recipe         *Recipe   `gorm:"foreignKey:RecipeID" json:"recipe,omitempty"`
	PreparedAt     time.Time `json:"prepared_at"`
	Servings       int       `gorm:"not null;default:4" json:"servings"`
	IdempotencyKey string    `gorm:"uniqueIndex;type:varchar(128);not null" json:"idempotency_key"`
	Notes          string    `gorm:"type:text" json:"notes"`
}

type MonthlyScheduleItem struct {
	BaseModel
	HouseholdID string   `gorm:"type:varchar(64);index;not null" json:"household_id"`
	DayOfMonth  int      `gorm:"not null;index" json:"day_of_month"` // 1 to 31
	Slot        MealSlot `gorm:"type:varchar(32);not null" json:"slot"`
	RecipeID    string   `gorm:"type:varchar(64);index;not null" json:"recipe_id"`
	Recipe      *Recipe  `gorm:"foreignKey:RecipeID" json:"recipe,omitempty"`
	Servings    int      `gorm:"not null;default:4" json:"servings"`
	IsSkipped   bool     `gorm:"default:false" json:"is_skipped"`
	IsPrepared  bool     `gorm:"default:false" json:"is_prepared"`
	Notes       string   `gorm:"type:text" json:"notes"`
}

type ShoppingListStatus string

const (
	ShoppingActive    ShoppingListStatus = "active"
	ShoppingCompleted ShoppingListStatus = "completed"
	ShoppingArchived  ShoppingListStatus = "archived"
)

type ShoppingList struct {
	BaseModel
	HouseholdID string             `gorm:"type:varchar(64);index;not null" json:"household_id"`
	Title       string             `gorm:"type:varchar(191);not null" json:"title"`
	Status      ShoppingListStatus `gorm:"type:varchar(32);default:'active'" json:"status"`
	StartDate   string             `gorm:"type:varchar(10)" json:"start_date"` // YYYY-MM-DD
	EndDate     string             `gorm:"type:varchar(10)" json:"end_date"`   // YYYY-MM-DD
	Items       []ShoppingItem     `gorm:"foreignKey:ShoppingListID" json:"items,omitempty"`
	TotalEstCost float64           `gorm:"-" json:"total_est_cost"`
	TotalActCost float64           `gorm:"-" json:"total_act_cost"`
}

type ShoppingItem struct {
	BaseModel
	ShoppingListID   string           `gorm:"type:varchar(64);index;not null" json:"shopping_list_id"`
	IngredientID     string           `gorm:"type:varchar(64);index;not null" json:"ingredient_id"`
	Ingredient       *Ingredient      `gorm:"foreignKey:IngredientID" json:"ingredient,omitempty"`
	RequiredQuantity float64          `gorm:"type:decimal(12,3);not null" json:"required_quantity"`
	BoughtQuantity   float64          `gorm:"type:decimal(12,3);default:0" json:"bought_quantity"`
	UnitID           string           `gorm:"type:varchar(64);not null" json:"unit_id"`
	Unit             *Unit            `gorm:"foreignKey:UnitID" json:"unit,omitempty"`
	EstimatedPrice   float64          `gorm:"type:decimal(12,2);default:0" json:"estimated_price"`
	ActualPrice      float64          `gorm:"type:decimal(12,2);default:0" json:"actual_price"`
	IsBought         bool             `gorm:"default:false;index" json:"is_bought"`
	AddedToInventory bool             `gorm:"default:false" json:"added_to_inventory"`
	GroupID          string           `gorm:"type:varchar(64);index" json:"group_id"`
	Group            *IngredientGroup `gorm:"foreignKey:GroupID" json:"group,omitempty"`
	Notes            string           `gorm:"type:text" json:"notes"`
}

type Purchase struct {
	BaseModel
	HouseholdID string         `gorm:"type:varchar(64);index;not null" json:"household_id"`
	Date        time.Time      `json:"date"`
	TotalAmount float64        `gorm:"type:decimal(12,2);not null;default:0" json:"total_amount"`
	Currency    string         `gorm:"type:varchar(10);default:'IQD'" json:"currency"`
	Vendor      string         `gorm:"type:varchar(191)" json:"vendor"`
	Notes       string         `gorm:"type:text" json:"notes"`
	Items       []PurchaseItem `gorm:"foreignKey:PurchaseID" json:"items,omitempty"`
}

type PurchaseItem struct {
	BaseModel
	PurchaseID   string      `gorm:"type:varchar(64);index;not null" json:"purchase_id"`
	IngredientID string      `gorm:"type:varchar(64);index;not null" json:"ingredient_id"`
	Ingredient   *Ingredient `gorm:"foreignKey:IngredientID" json:"ingredient,omitempty"`
	Quantity     float64     `gorm:"type:decimal(12,3);not null" json:"quantity"`
	UnitID       string      `gorm:"type:varchar(64);not null" json:"unit_id"`
	Unit         *Unit       `gorm:"foreignKey:UnitID" json:"unit,omitempty"`
	UnitPrice    float64     `gorm:"type:decimal(12,2);not null" json:"unit_price"`
	TotalPrice   float64     `gorm:"type:decimal(12,2);not null" json:"total_price"`
}

type SyncOperation struct {
	BaseModel
	HouseholdID   string    `gorm:"type:varchar(64);index;not null" json:"household_id"`
	ClientOpID    string    `gorm:"uniqueIndex;type:varchar(128);not null" json:"client_op_id"`
	EntityType    string    `gorm:"type:varchar(64);not null;index" json:"entity_type"`
	EntityID      string    `gorm:"type:varchar(64);not null;index" json:"entity_id"`
	Action        string    `gorm:"type:varchar(32);not null" json:"action"` // create, update, delete
	PayloadJSON   string    `gorm:"type:text;not null" json:"payload_json"`
	ClientTime    time.Time `json:"client_time"`
	Status        string    `gorm:"type:varchar(32);default:'applied'" json:"status"` // applied, conflict, error
	ConflictNotes string    `gorm:"type:text" json:"conflict_notes"`
}

type Setting struct {
	BaseModel
	HouseholdID string `gorm:"type:varchar(64);index;not null" json:"household_id"`
	Key         string `gorm:"type:varchar(64);not null;index" json:"key"`
	Value       string `gorm:"type:text;not null" json:"value"`
}
