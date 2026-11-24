package services

import (
	"fmt"
	"time"

	"bayti-kitchen/backend/internal/models"
	"bayti-kitchen/backend/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ShoppingService struct {
	shopRepo     *repository.ShoppingRepository
	mealPlanRepo *repository.MealPlanRepository
	invRepo      *repository.InventoryRepository
	ingRepo      *repository.IngredientRepository
	unitServ     *UnitService
}

func NewShoppingService(
	shopRepo *repository.ShoppingRepository,
	mealPlanRepo *repository.MealPlanRepository,
	invRepo *repository.InventoryRepository,
	ingRepo *repository.IngredientRepository,
	unitServ *UnitService,
) *ShoppingService {
	return &ShoppingService{
		shopRepo:     shopRepo,
		mealPlanRepo: mealPlanRepo,
		invRepo:      invRepo,
		ingRepo:      ingRepo,
		unitServ:     unitServ,
	}
}

type GenerateSmartListRequest struct {
	HouseholdID string `json:"household_id"`
	StartDate   string `json:"start_date" binding:"required"` // YYYY-MM-DD
	EndDate     string `json:"end_date" binding:"required"`   // YYYY-MM-DD
	ListTitle   string `json:"list_title"`
}

// GenerateSmartList aggregates all required ingredients for scheduled meals in range,
// deducts current inventory stock, and creates or updates a smart shopping list.
func (s *ShoppingService) GenerateSmartList(req *GenerateSmartListRequest) (*models.ShoppingList, error) {
	if req.ListTitle == "" {
		req.ListTitle = fmt.Sprintf("قائمة التسوق (%s إلى %s)", req.StartDate, req.EndDate)
	}

	items, err := s.mealPlanRepo.GetItemsByDateRange(req.HouseholdID, req.StartDate, req.EndDate)
	if err != nil {
		return nil, err
	}

	// Map to aggregate needed quantities per ingredient: ingredientID -> total quantity in default unit
	type reqAccumulator struct {
		ingredient   *models.Ingredient
		totalNeeded  float64 // in ingredient.DefaultUnit
		estimatedCost float64
	}
	neededMap := make(map[string]*reqAccumulator)

	for _, item := range items {
		// Ignore skipped or already prepared meals
		if item.IsSkipped || item.IsPrepared || item.Recipe == nil {
			continue
		}

		servingsRatio := 1.0
		if item.Recipe.Servings > 0 && item.Servings > 0 {
			servingsRatio = float64(item.Servings) / float64(item.Recipe.Servings)
		}

		for _, ri := range item.Recipe.Ingredients {
			ing := ri.Ingredient
			if ing == nil || ing.DefaultUnit == nil || ri.Unit == nil {
				continue
			}

			scaledQty := ri.Quantity * servingsRatio
			// Convert to ingredient default unit
			qtyInDefUnit, err := s.unitServ.ConvertQuantity(scaledQty, ri.Unit, ing.DefaultUnit, ing.Density)
			if err != nil {
				qtyInDefUnit = scaledQty // fallback
			}

			acc, exists := neededMap[ing.ID]
			if !exists {
				acc = &reqAccumulator{
					ingredient: ing,
				}
				neededMap[ing.ID] = acc
			}
			acc.totalNeeded += qtyInDefUnit
		}
	}

	// Fetch current inventory and calculate (totalNeeded - currentStock)
	var smartItems []models.ShoppingItem
	var totalEstCost float64

	for ingID, acc := range neededMap {
		inv, err := s.invRepo.GetInventoryByIngredientID(nil, ingID, req.HouseholdID)
		var currentStockInDefUnit float64
		if err == nil && inv != nil && inv.Unit != nil {
			convertedStock, convErr := s.unitServ.ConvertQuantity(inv.Quantity, inv.Unit, acc.ingredient.DefaultUnit, acc.ingredient.Density)
			if convErr == nil {
				currentStockInDefUnit = convertedStock
			} else {
				currentStockInDefUnit = inv.Quantity
			}
		}

		deficit := acc.totalNeeded - currentStockInDefUnit
		if deficit > 0 {
			estCost := deficit * acc.ingredient.UnitPrice
			totalEstCost += estCost

			smartItems = append(smartItems, models.ShoppingItem{
				BaseModel:        models.BaseModel{ID: uuid.NewString()},
				IngredientID:     ingID,
				RequiredQuantity: deficit,
				BoughtQuantity:   deficit,
				UnitID:           acc.ingredient.DefaultUnitID,
				EstimatedPrice:   estCost,
				ActualPrice:      estCost,
				IsBought:         false,
				AddedToInventory: false,
				GroupID:          acc.ingredient.GroupID,
			})
		}
	}

	// Create new shopping list or clear old active list
	list := models.ShoppingList{
		BaseModel:    models.BaseModel{ID: uuid.NewString()},
		HouseholdID:  req.HouseholdID,
		Title:        req.ListTitle,
		Status:       models.ShoppingActive,
		StartDate:    req.StartDate,
		EndDate:      req.EndDate,
		Items:        smartItems,
		TotalEstCost: totalEstCost,
	}

	err = s.shopRepo.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&list).Error; err != nil {
			return err
		}
		for i := range list.Items {
			list.Items[i].ShoppingListID = list.ID
			if err := tx.Create(&list.Items[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		return nil, err
	}

	return s.shopRepo.GetListByID(list.ID)
}

type MarkItemBoughtRequest struct {
	HouseholdID    string  `json:"household_id"`
	ShoppingItemID string  `json:"shopping_item_id" binding:"required"`
	BoughtQuantity float64 `json:"bought_quantity" binding:"required"`
	ActualPrice    float64 `json:"actual_price"` // Total price paid
	AddToInventory bool    `json:"add_to_inventory"`
	Vendor         string  `json:"vendor"`
	Notes          string  `json:"notes"`
}

// MarkItemBought marks item as purchased, adds stock to inventory in one transaction, and logs purchase expense
func (s *ShoppingService) MarkItemBought(req *MarkItemBoughtRequest) error {
	return s.shopRepo.DB().Transaction(func(tx *gorm.DB) error {
		var item models.ShoppingItem
		if err := tx.Preload("Ingredient").Preload("Ingredient.DefaultUnit").Preload("Unit").
			Where("id = ?", req.ShoppingItemID).First(&item).Error; err != nil {
			return fmt.Errorf("shopping item not found: %w", err)
		}

		item.BoughtQuantity = req.BoughtQuantity
		item.ActualPrice = req.ActualPrice
		item.IsBought = true
		item.AddedToInventory = req.AddToInventory

		if err := tx.Save(&item).Error; err != nil {
			return err
		}

		if req.AddToInventory && item.Ingredient != nil {
			// Convert bought quantity to default unit
			ing := item.Ingredient
			convertedQty, err := s.unitServ.ConvertQuantity(req.BoughtQuantity, item.Unit, ing.DefaultUnit, ing.Density)
			if err != nil {
				convertedQty = req.BoughtQuantity
			}

			// Upsert inventory
			inv, err := s.invRepo.GetInventoryByIngredientID(tx, ing.ID, req.HouseholdID)
			if err != nil {
				inv = &models.Inventory{
					BaseModel:    models.BaseModel{ID: uuid.NewString()},
					HouseholdID:  req.HouseholdID,
					IngredientID: ing.ID,
					Quantity:     0,
					UnitID:       ing.DefaultUnitID,
				}
			}

			inv.Quantity += convertedQty
			inv.LastStockAt = time.Now().UTC()
			if err := s.invRepo.UpsertInventory(tx, inv); err != nil {
				return err
			}

			// Record inventory purchase transaction
			txLog := models.InventoryTransaction{
				BaseModel:      models.BaseModel{ID: uuid.NewString()},
				HouseholdID:    req.HouseholdID,
				IngredientID:   ing.ID,
				Type:           models.TxTypePurchase,
				QuantityDelta:  convertedQty,
				UnitID:         ing.DefaultUnitID,
				UnitPrice:      req.ActualPrice / req.BoughtQuantity,
				TotalPrice:     req.ActualPrice,
				ReferenceID:    item.ID,
				Notes:          fmt.Sprintf("شراء من قائمة التسوق: %s", req.Notes),
				IdempotencyKey: fmt.Sprintf("shop_item_%s", item.ID),
			}
			if err := s.invRepo.RecordTransaction(tx, &txLog); err != nil {
				// Don't fail if already recorded
			}

			// Record in Purchase entity
			p := models.Purchase{
				BaseModel:   models.BaseModel{ID: uuid.NewString()},
				HouseholdID: req.HouseholdID,
				Date:        time.Now().UTC(),
				TotalAmount: req.ActualPrice,
				Currency:    "IQD",
				Vendor:      req.Vendor,
				Notes:       fmt.Sprintf("شراء %s", ing.NameAr),
			}
			if err := tx.Create(&p).Error; err != nil {
				return err
			}

			pItem := models.PurchaseItem{
				BaseModel:    models.BaseModel{ID: uuid.NewString()},
				PurchaseID:   p.ID,
				IngredientID: ing.ID,
				Quantity:     req.BoughtQuantity,
				UnitID:       item.UnitID,
				UnitPrice:    req.ActualPrice / req.BoughtQuantity,
				TotalPrice:   req.ActualPrice,
			}
			if err := tx.Create(&pItem).Error; err != nil {
				return err
			}
		}

		return nil
	})
}
